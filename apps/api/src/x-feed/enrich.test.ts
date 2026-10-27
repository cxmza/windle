import { readFileSync } from 'node:fs';
import { type ApiError, XPost } from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { makeTestApp } from '../test/helpers.ts';
import { MemoryXEnrichStore } from './enrich.ts';
import { XFeedHub } from './hub.ts';
import { resolveTco, TwitterApiClient, TwitterApiUnavailable } from './twitterapi.ts';
import { mapTweet, safeMediaUrl } from './twitterapi-map.ts';

const KEY = 'test-key-0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const NOW = new Date('2026-10-13T00:00:00.000Z');

const FIXTURES = {
  imageGovernment: 'image-government',
  photosBlue: 'photos-blue',
  video: 'video-business',
  gif: 'gif',
  poll: 'poll',
  cardThread: 'card-thread',
  cardReply: 'card-summary-reply',
  articleAffiliate: 'article-affiliate',
  quote: 'quote',
  repost: 'repost',
  reply: 'reply',
} as const;

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/twitterapi/${name}.json`, import.meta.url), 'utf8');
}

/** tweet id -> recorded `/twitter/tweets` body */
const BY_ID = new Map(
  Object.values(FIXTURES).map((name) => {
    const body = fixture(name);
    return [(JSON.parse(body) as { tweets: { id: string }[] }).tweets[0]?.id ?? '', body] as const;
  }),
);
const ID = Object.fromEntries(
  Object.entries(FIXTURES).map(([k, name]) => [k, [...BY_ID].find(([, body]) => body === fixture(name))?.[0] ?? '']),
) as Record<keyof typeof FIXTURES, string>;

async function mapped(name: keyof typeof FIXTURES, articles?: Map<string, { title: string }>) {
  const body = fixture(FIXTURES[name]);
  const client = new TwitterApiClient({ apiKey: KEY, fetch: async () => new Response(body) });
  const raw = await client.tweet(ID[name]);
  if (!raw) throw new Error('fixture has no tweet');
  const post = await mapTweet(raw, {
    now: NOW,
    resolveTco: async (url) => `https://resolved.example/${url.slice('https://t.co/'.length)}`,
    ...(articles ? { articles } : {}),
  });
  return XPost.parse(post);
}

describe('twitterapi.io mapping (recorded fixtures)', () => {
  it('maps every fixture to a valid XPost with source twitterapi', async () => {
    for (const name of Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]) {
      const post = await mapped(name);
      expect(post.source).toBe('twitterapi');
      expect(post.enrichedAt).toBe(NOW.toISOString());
      expect(post.url).toBe(`https://x.com/${post.author.handle}/status/${post.id}`);
      expect(post.metrics).not.toBeNull();
    }
  });

  it('image post: government check, size, _bigger avatar, metrics, media link cut from the text', async () => {
    const post = await mapped('imageGovernment');
    expect(post.kind).toBe('tweet');
    expect(post.author).toMatchObject({ handle: 'WhiteHouse', verified: 'government', affiliate: null, tags: [] });
    expect(post.author.avatarUrl).toMatch(/^https:\/\/pbs\.twimg\.com\/profile_images\/.+_bigger\.jpg$/);
    expect(post.media).toEqual([
      {
        type: 'image',
        url: 'https://pbs.twimg.com/media/HUdtQb6XwAAmcXN.jpg',
        width: 3500,
        height: 2333,
        altText: null,
      },
    ]);
    expect(post.text).toBe('POTUS X @BarstoolGruden X @Jakepaul\n\nOHIO, GET READY 🦅');
    expect(post.createdAt).toBe('2026-10-12T22:36:07.213Z');
  });

  it('several photos and a blue check', async () => {
    const post = await mapped('photosBlue');
    expect(post.author.verified).toBe('blue');
    expect(post.media).toHaveLength(4);
    expect(post.media.every((m) => m.type === 'image' && m.width && m.height)).toBe(true);
    expect(post.urls).toEqual([
      {
        url: 'https://t.co/cjtSqLgbc6',
        expandedUrl: 'https://poidh.xyz/mainnet/bounty/31',
        displayUrl: 'poidh.xyz/mainnet/bounty…',
      },
    ]);
  });

  it('video: business check, mp4 variants best first on video.twimg.com, a 720p default, poster, duration', async () => {
    const post = await mapped('video');
    expect(post.author.verified).toBe('business');
    const [video] = post.media;
    expect(video).toMatchObject({
      type: 'video',
      url: 'https://video.twimg.com/amplify_video/2109742655718760448/vid/avc1/1280x720/YtOgHb1zqCOuH04e.mp4?tag=16',
      posterUrl: 'https://pbs.twimg.com/amplify_video_thumb/2109742655718760448/img/g_Js36TsMrTCACk3.jpg',
      width: 1920,
      height: 1080,
      durationMs: 45682,
    });
    expect(video?.variants?.map((v) => [v.contentType, v.bitrate])).toEqual([
      ['video/mp4', 10368000],
      ['video/mp4', 2176000],
      ['video/mp4', 832000],
      ['video/mp4', 288000],
      ['application/x-mpegURL', null],
    ]);
    // Recorded on video-s.twimg.com; rewritten to the allowed host that serves the same paths.
    expect(video?.variants?.every((v) => v.url.startsWith('https://video.twimg.com/'))).toBe(true);
    expect(post.text.endsWith('Solana Summit Korea')).toBe(true);
  });

  it('gif: one mp4, poster, no duration', async () => {
    const [gif] = (await mapped('gif')).media;
    expect(gif).toMatchObject({
      type: 'gif',
      url: 'https://video.twimg.com/tweet_video/HS0QnHZagAAfv3Q.mp4',
      posterUrl: 'https://pbs.twimg.com/tweet_video_thumb/HS0QnHZagAAfv3Q.jpg',
      width: 370,
      height: 500,
      durationMs: null,
    });
    expect(gif?.variants).toEqual([
      { url: 'https://video.twimg.com/tweet_video/HS0QnHZagAAfv3Q.mp4', contentType: 'video/mp4', bitrate: 0 },
    ]);
  });

  it('poll: options with votes, total, end time, closed; no card', async () => {
    const post = await mapped('poll');
    expect(post.card).toBeNull();
    expect(post.poll).toEqual({
      options: [
        { label: 'Joe Biden (D)', votes: 9682 },
        { label: 'Lars Mapstead (L)', votes: 2161 },
        { label: 'Donald Trump (R)', votes: 27621 },
      ],
      totalVotes: 39464,
      endsAt: '2023-08-07T15:12:18.000Z',
      closed: true,
    });
    // A pre-2023 snowflake still derives its time from the id.
    expect(post.createdAt).toBe('2023-07-31T15:12:18.522Z');
  });

  it('link card from card.legacy with the t.co expanded from the url entities; a self-reply is a thread', async () => {
    const post = await mapped('cardThread');
    expect(post.card).toEqual({
      kind: 'summary_large_image',
      url: 'https://solana.com/breakpoint',
      domain: 'solana.com',
      title: "Breakpoint 2026 — Solana's flagship conference in London",
      description:
        'Three days for 8,000+ attendees shaping the Token Supercycle across capital markets, payments, technology, and policy at Olympia London, November 15–17, 2026.',
      imageUrl: 'https://pbs.twimg.com/card_img/2108704582260199424/ExsIJO7P?format=jpg&name=800x419',
    });
    expect(post).toMatchObject({
      kind: 'reply',
      thread: true,
      inReplyTo: { id: '2109672242045231232', handle: 'solana' },
      conversationId: '2109672003380924835',
    });
  });

  it('reply to someone else: leading mention cut, summary card without image, not a thread', async () => {
    const post = await mapped('cardReply');
    expect(post.thread).toBe(false);
    expect(post.inReplyTo).toEqual({ id: '2106577373219143746', handle: 'bballer_530' });
    expect(post.text.startsWith('@')).toBe(false);
    expect(post.card).toMatchObject({
      kind: 'summary',
      url: 'https://vitalik.eth.limo/general/2025/04/14/privacy.html',
      domain: 'vitalik.eth.limo',
      title: 'Why I support privacy',
      imageUrl: null,
    });
    expect(post.lang).toBe('zh');
  });

  it('plain reply', async () => {
    const post = await mapped('reply');
    expect(post).toMatchObject({ kind: 'reply', text: 'See you in London 👀', thread: false });
  });

  it('affiliate badge and an X article (from the separate article lookup)', async () => {
    const article = JSON.parse(fixture('article')) as {
      article: { title: string; preview_text: string; cover_media_img_url: string };
    };
    const post = await mapped('articleAffiliate', new Map([[ID.articleAffiliate, article.article]]));
    expect(post.author).toMatchObject({
      verified: 'business',
      affiliate: {
        name: 'NVIDIA',
        handle: 'nvidia',
        badgeUrl: 'https://pbs.twimg.com/profile_images/1828904711124078593/SRvCZSfQ_bigger.jpg',
      },
      automated: false,
    });
    expect(post.article).toEqual({
      title: 'A New Way to Build Edge AI with Jetson Agent Skills',
      previewText: expect.stringMatching(/^Building edge AI involves more than writing code/),
      coverUrl: 'https://pbs.twimg.com/media/HULBnD2bAAAZA9V.jpg',
      url: 'https://x.com/i/article/2108460139460313088',
    });
    expect((await mapped('articleAffiliate')).article).toBeNull();
  });

  it('quote: the quoted post with its author check, video and time', async () => {
    const post = await mapped('quote');
    expect(post.kind).toBe('quote');
    expect(post.quoted).toMatchObject({
      id: '2109654404702015576',
      author: { handle: 'colosseum', verified: 'business' },
      createdAt: '2026-10-12T14:36:20.221Z',
    });
    expect(post.quoted?.media[0]?.type).toBe('video');
    expect(post.quoted?.media[0]?.variants?.length).toBeGreaterThan(1);
  });

  it('repost: empty own text, the original in quoted with its link card and metrics', async () => {
    const post = await mapped('repost');
    expect(post).toMatchObject({ kind: 'repost', text: '', media: [], card: null, inReplyTo: null });
    expect(post.quoted).toMatchObject({
      id: '2109408642697199884',
      author: { handle: 'colosseum' },
      card: { kind: 'summary_large_image', url: 'https://colosseum.com/worldsfair', domain: 'colosseum.com' },
    });
    expect(post.quoted?.text.startsWith('As a reminder')).toBe(true);
  });

  it('allows only X media hosts and rewrites video-s to video', () => {
    expect(safeMediaUrl('https://pbs.twimg.com/media/a.jpg')).toBe('https://pbs.twimg.com/media/a.jpg');
    expect(safeMediaUrl('https://abs.twimg.com/a.png')).toBe('https://abs.twimg.com/a.png');
    expect(safeMediaUrl('https://ton.twimg.com/a.png')).toBe('https://ton.twimg.com/a.png');
    expect(safeMediaUrl('https://video-s.twimg.com/v/a.mp4?tag=1')).toBe('https://video.twimg.com/v/a.mp4?tag=1');
    expect(safeMediaUrl('http://pbs.twimg.com/media/a.jpg')).toBeNull();
    expect(safeMediaUrl('https://evil.example/a.jpg')).toBeNull();
    expect(safeMediaUrl('https://pbs.twimg.com.evil.example/a.jpg')).toBeNull();
    expect(safeMediaUrl('javascript:alert(1)')).toBeNull();
  });

  it('drops media on foreign hosts, falls back to a t.co hop for card links', async () => {
    const raw = JSON.parse(fixture('card-thread')) as { tweets: Record<string, unknown>[] };
    const tweet = raw.tweets[0] as {
      entities: { urls: unknown[] };
      author: { profilePicture: string };
      extendedEntities?: unknown;
    };
    tweet.entities.urls = [];
    tweet.author.profilePicture = 'https://evil.example/a.jpg';
    tweet.extendedEntities = { media: [{ type: 'photo', media_url_https: 'https://evil.example/b.jpg' }] };
    const client = new TwitterApiClient({ apiKey: KEY, fetch: async () => new Response(JSON.stringify(raw)) });
    const parsed = await client.tweet(ID.cardThread);
    if (!parsed) throw new Error('no tweet');
    const post = XPost.parse(
      await mapTweet(parsed, { now: NOW, resolveTco: async () => 'https://solana.com/breakpoint?from=tco' }),
    );
    expect(post.author.avatarUrl).toBeNull();
    expect(post.media).toEqual([]);
    expect(post.card?.url).toBe('https://solana.com/breakpoint?from=tco');
  });
});

describe('TwitterApiClient', () => {
  it('sends the key header, returns null for an unknown id and never puts the key in errors', async () => {
    let header: string | null = null;
    const ok = new TwitterApiClient({
      apiKey: KEY,
      fetch: async (_url, init) => {
        header = new Headers(init?.headers).get('x-api-key');
        return new Response(fixture('not-found'));
      },
    });
    expect(await ok.tweet('2109999999999999999')).toBeNull();
    expect(header).toBe(KEY);

    const leaky = new TwitterApiClient({
      apiKey: KEY,
      fetch: async () => {
        throw new Error(`connect failed for X-API-Key: ${KEY}`);
      },
    });
    const err = await leaky.tweet('1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TwitterApiUnavailable);
    expect(String((err as Error).message)).not.toContain(KEY);
    expect(String((err as Error).message)).toContain('[redacted]');

    const unauthorized = new TwitterApiClient({
      apiKey: KEY,
      fetch: async () => new Response('{"error":"Unauthorized","message":"API key is invalid"}', { status: 401 }),
    });
    await expect(unauthorized.tweet('1')).rejects.toThrow('twitterapi.io answered 401');
  });

  it('resolveTco follows one redirect of a t.co link only', async () => {
    const fake: typeof fetch = async () =>
      new Response(null, { status: 301, headers: { location: 'https://example.com/a?b=1' } });
    expect(await resolveTco('https://t.co/abc123', fake)).toBe('https://example.com/a?b=1');
    expect(await resolveTco('https://example.com/x', fake)).toBeNull();
    const loop: typeof fetch = async () =>
      new Response(null, { status: 301, headers: { location: 'https://t.co/other' } });
    expect(await resolveTco('https://t.co/abc123', loop)).toBeNull();
  });
});

// --- route --------------------------------------------------------------------------------------------------

interface FakeX {
  fetch: typeof fetch;
  calls: string[];
  /** Overrides by tweet id: a status code to answer with. */
  failWith: number | null;
}

function fakeX(): FakeX {
  const state: FakeX = {
    calls: [],
    failWith: null,
    fetch: async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      state.calls.push(`${url.hostname}${url.pathname}`);
      if (url.hostname === 't.co') return new Response(null, { status: 404 });
      if (state.failWith) return new Response('{"error":"boom"}', { status: state.failWith });
      if (url.pathname === '/twitter/tweets') {
        const id = url.searchParams.get('tweet_ids') ?? '';
        return new Response(BY_ID.get(id) ?? fixture('not-found'), { headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/twitter/article') return new Response(fixture('article'));
      return new Response('not found', { status: 404 });
    },
  };
  return state;
}

/** A relay that knows one post (with its tags/signals/receivedAt), or is down. */
function relayHub(known?: XPost, down = false) {
  return new XFeedHub({
    relayUrl: 'http://relay.test',
    log: pino({ level: 'silent' }),
    fetch: async (input) => {
      if (down) throw new Error('connect ECONNREFUSED');
      const id = String(input).split('/post/')[1];
      if (known && id === known.id) return new Response(JSON.stringify(known));
      return new Response('{"error":"post not seen recently"}', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

describe('GET /v1/x/post/:id?enrich=1', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function setup(env: Record<string, string> = {}, opts: { relay?: XFeedHub } = {}) {
    const x = fakeX();
    const clock = { now: NOW.getTime() };
    const store = new MemoryXEnrichStore(() => clock.now);
    const built = makeTestApp({
      env: { TWITTERAPI_IO_KEY: KEY, ...env },
      clock,
      xEnrichStore: store,
      xEnrichFetch: x.fetch,
      xFeed: opts.relay ?? relayHub(),
    });
    app = built.app;
    const get = (id: string, query = '?enrich=1', ip = '203.0.113.7') =>
      built.app.inject({ method: 'GET', url: `/v1/x/post/${id}${query}`, remoteAddress: ip });
    return { x, clock, store, get, app: built.app };
  }

  it('is off without a key: 503 x_enrich_unavailable with Retry-After', async () => {
    const { get, x } = setup({ TWITTERAPI_IO_KEY: '' });
    const res = await get(ID.video);
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.json<ApiError>().error.code).toBe('x_enrich_unavailable');
    expect(x.calls).toEqual([]);
  });

  it('returns the enriched post, caches it for 5 minutes and refetches after', async () => {
    const { get, x, clock } = setup();
    const res = await get(ID.video);
    expect(res.statusCode).toBe(200);
    const post = XPost.parse(res.json());
    expect(post).toMatchObject({ source: 'twitterapi', enrichedAt: NOW.toISOString(), kind: 'tweet' });
    expect(post.media[0]?.variants?.length).toBe(5);
    expect(JSON.stringify(res.json())).not.toContain(KEY);

    expect((await get(ID.video)).statusCode).toBe(200);
    expect(x.calls.filter((c) => c.endsWith('/twitter/tweets'))).toHaveLength(1);

    clock.now += 5 * 60_000 + 1;
    const later = XPost.parse((await get(ID.video)).json());
    expect(x.calls.filter((c) => c.endsWith('/twitter/tweets'))).toHaveLength(2);
    expect(later.enrichedAt).toBe(new Date(clock.now).toISOString());
  });

  it('serves the cached copy when X fails after it went stale, 503 when there is none', async () => {
    const { get, x, clock } = setup();
    expect((await get(ID.poll)).statusCode).toBe(200);
    clock.now += 10 * 60_000;
    x.failWith = 500;
    const stale = await get(ID.poll);
    expect(stale.statusCode).toBe(200);
    expect(stale.json<XPost>().enrichedAt).toBe(NOW.toISOString());

    const none = await get(ID.gif);
    expect(none.statusCode).toBe(503);
    expect(none.json<ApiError>().error.code).toBe('x_enrich_unavailable');
  });

  it('keeps the relay copy’s tags, signals and receivedAt', async () => {
    const relayCopy = XPost.parse({
      id: ID.video,
      kind: 'tweet',
      createdAt: '2026-10-12T20:27:09.850Z',
      receivedAt: '2026-10-12T20:27:10.500Z',
      url: `https://x.com/solana/status/${ID.video}`,
      author: {
        id: '951329744804392960',
        handle: 'solana',
        name: 'Solana',
        avatarUrl: null,
        followers: 1,
        tags: ['kol'],
      },
      text: 'short copy',
      media: [],
      quoted: null,
      inReplyTo: null,
      source: 'gmgn',
      signals: ['keyword'],
    });
    const { get } = setup({}, { relay: relayHub(relayCopy) });
    const post = XPost.parse((await get(ID.video)).json());
    expect(post).toMatchObject({
      source: 'twitterapi',
      receivedAt: '2026-10-12T20:27:10.500Z',
      signals: ['keyword'],
      author: { tags: ['kol'], verified: 'business', followers: 4219038 },
    });
    expect(post.text).not.toBe('short copy');
  });

  it('works while the relay is down', async () => {
    const { get } = setup({}, { relay: relayHub(undefined, true) });
    expect((await get(ID.reply)).statusCode).toBe(200);
  });

  it('answers 404 x_post_not_found for a deleted/unknown post and caches that briefly', async () => {
    const { get, x } = setup();
    const res = await get('2109999999999999999');
    expect(res.statusCode).toBe(404);
    expect(res.json<ApiError>().error.code).toBe('x_post_not_found');
    expect((await get('2109999999999999999')).statusCode).toBe(404);
    expect(x.calls.filter((c) => c.endsWith('/twitter/tweets'))).toHaveLength(1);
  });

  it('fetches an X article once and charges it against the budget', async () => {
    const { get, x, store } = setup();
    const post = XPost.parse((await get(ID.articleAffiliate)).json());
    expect(post.article?.title).toBe('A New Way to Build Edge AI with Jetson Agent Skills');
    expect(x.calls).toContain('api.twitterapi.io/twitter/article');
    expect(await store.spent('2026-10-13')).toBe(115);
  });

  it('stops at the daily credit budget', async () => {
    const { get, store } = setup({ TWITTERAPI_DAILY_BUDGET: '20' });
    expect((await get(ID.gif)).statusCode).toBe(200);
    const res = await get(ID.poll);
    expect(res.statusCode).toBe(503);
    expect(res.json<ApiError>().error.code).toBe('x_enrich_unavailable');
    expect(await store.spent('2026-10-13')).toBe(15);
    // Cached posts are still served.
    expect((await get(ID.gif)).statusCode).toBe(200);
  });

  it('fails closed when the budget store is down', async () => {
    const { get, store } = setup();
    store.failing = true;
    const res = await get(ID.gif);
    expect(res.statusCode).toBe(503);
  });

  it('rate-limits upstream lookups per client IP (cache hits are free)', async () => {
    const { get } = setup({ X_ENRICH_RATE_LIMIT_PER_MINUTE: '2' });
    expect((await get(ID.gif)).statusCode).toBe(200);
    expect((await get(ID.poll)).statusCode).toBe(200);
    expect((await get(ID.gif)).statusCode).toBe(200);
    const limited = await get(ID.reply);
    expect(limited.statusCode).toBe(429);
    expect(limited.json<ApiError>().error.code).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await get(ID.reply, '?enrich=1', '198.51.100.9')).statusCode).toBe(200);
  });

  it('answers 503 (not 500) when twitterapi.io rejects the key', async () => {
    const { get, x } = setup();
    x.failWith = 401;
    const res = await get(ID.quote);
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain(KEY);
  });

  it('validates enrich and keeps the plain lookup without it', async () => {
    const { get, x } = setup();
    expect((await get(ID.video, '?enrich=2')).statusCode).toBe(400);
    const plain = await get(ID.video, '');
    expect(plain.statusCode).toBe(404);
    expect(plain.json<ApiError>().error.code).toBe('x_post_not_found');
    expect(x.calls).toEqual([]);
  });

  it('counts outcomes and credits in /metrics', async () => {
    const { get, app: a } = setup();
    await get(ID.gif);
    await get(ID.gif);
    const metrics = await a.inject({ method: 'GET', url: '/metrics', remoteAddress: '127.0.0.1' });
    expect(metrics.body).toContain('windle_x_enrich_total{result="miss"} 1');
    expect(metrics.body).toContain('windle_x_enrich_total{result="hit"} 1');
    expect(metrics.body).toContain('windle_x_enrich_credits_total 15');
  });
});

describe('config', () => {
  it('reads the twitterapi.io settings and keeps enrichment off without a key', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).xEnrich).toEqual({
      apiKey: undefined,
      baseUrl: 'https://api.twitterapi.io',
      dailyBudget: 50_000,
      ratePerMinute: 30,
    });
    expect(
      loadConfig({ NODE_ENV: 'test', TWITTERAPI_IO_KEY: 'k', TWITTERAPI_DAILY_BUDGET: '100' }).xEnrich,
    ).toMatchObject({ apiKey: 'k', dailyBudget: 100 });
    expect(() => loadConfig({ NODE_ENV: 'test', TWITTERAPI_BASE_URL: 'http://api.twitterapi.io' })).toThrow(
      /TWITTERAPI_BASE_URL/,
    );
  });
});
