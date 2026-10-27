import { readFileSync } from 'node:fs';
import { type ApiError, parseTweetUrl } from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryMarketRepository } from '../markets/memory.ts';
import type { MarketRecord } from '../markets/types.ts';
import { sharePage } from '../routes/share.ts';
import { FIXTURE_MARKETS, SYSTEM_CREATOR_ADDRESS, seedFixtureMarkets } from '../seed/fixture-markets.ts';
import { MemoryCacheStore } from '../store/cache.ts';
import { makeTestApp } from '../test/helpers.ts';
import { fetchAvatar, WINDLE_MARK_PATH } from './og.ts';

const NOW = new Date('2026-10-11T12:00:00.000Z');

/** Width and height from the PNG IHDR chunk (bytes 16..23), after checking the signature. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const meta = (html: string, attr: 'property' | 'name', key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`))?.[1];

describe('seed', () => {
  it('inserts the open fixture markets once, fresh and untraded', async () => {
    const repo = new MemoryMarketRepository();
    const first = await seedFixtureMarkets(repo, NOW);
    expect(first.inserted).toHaveLength(FIXTURE_MARKETS.length);
    expect(FIXTURE_MARKETS.length).toBe(12);
    const again = await seedFixtureMarkets(repo, new Date(NOW.getTime() + 60_000));
    expect(again).toEqual({ inserted: [], skipped: first.inserted });

    const { markets, total } = await repo.listMarkets({
      status: 'all',
      tier: undefined,
      sort: 'new',
      limit: 100,
      offset: 0,
      now: NOW,
    });
    expect(total).toBe(12);
    const ids = new Set<string>();
    for (const m of markets) {
      const fixture = FIXTURE_MARKETS.find((f) => f.slug === m.slug);
      expect(m).toMatchObject({ status: 'open', volumeMicro: 0, traders: 0, tradeCount: 0 });
      expect(m.creatorAddress).toBe(SYSTEM_CREATOR_ADDRESS);
      expect(m.probYes).toBeCloseTo((fixture?.probPct ?? 0) / 100, 12);
      expect(m.closesAt.getTime()).toBeGreaterThan(NOW.getTime());
      expect(m.tier === 'backed').toBe(m.collateral !== null);
      const parsed = parseTweetUrl(m.source?.url ?? '');
      expect(parsed.ok && parsed.statusId).toBe(m.sourceTweetId);
      ids.add(m.sourceTweetId ?? '');
    }
    expect(ids.size).toBe(12);
  });
});

describe('share card', () => {
  it('draws the same mark as packages/brand', () => {
    const svg = readFileSync(new URL('../../../../packages/brand/assets/windle-mark.svg', import.meta.url), 'utf8');
    expect(svg).toContain(`d="${WINDLE_MARK_PATH}"`);
  });

  it('escapes market text in the share page', () => {
    const market = {
      slug: 'quote-test',
      statement: 'Ship "v2" <script>alert(1)</script> & more',
      probYes: 0.42,
      status: 'open',
      closesAt: new Date(NOW.getTime() + 3_600_000),
      outcome: null,
    } as MarketRecord;
    const html = sharePage(market, {
      appOrigin: 'https://app.windle.fun',
      apiOrigin: 'https://api.windle.fun',
      now: NOW,
    });
    expect(html).not.toContain('<script>');
    expect(meta(html, 'property', 'og:title')).toBe(
      'Ship &quot;v2&quot; &lt;script&gt;alert(1)&lt;/script&gt; &amp; more',
    );
    expect(meta(html, 'property', 'og:description')).toContain('YES 42% · NO 58%');
  });

  it('fetches avatars only from X image hosts, as jpeg/png, at a larger size', async () => {
    const asked: string[] = [];
    const fake = (type: string) => async (input: string | URL | Request) => {
      asked.push(String(input));
      return new Response(Buffer.from([1, 2, 3]), { headers: { 'content-type': type } });
    };
    expect(await fetchAvatar('https://evil.example/a.jpg', fake('image/jpeg'))).toBeNull();
    expect(await fetchAvatar('http://pbs.twimg.com/a.jpg', fake('image/jpeg'))).toBeNull();
    expect(await fetchAvatar('https://pbs.twimg.com/p/a_normal.jpg', fake('text/html'))).toBeNull();
    expect(await fetchAvatar('https://pbs.twimg.com/p/a_normal.jpg', fake('image/jpeg'))).toBe(
      'data:image/jpeg;base64,AQID',
    );
    expect(asked.at(-1)).toBe('https://pbs.twimg.com/p/a_200x200.jpg');
    expect(asked.every((u) => u.startsWith('https://pbs.twimg.com/'))).toBe(true);
  });
});

describe('share routes', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function setup() {
    const markets = new MemoryMarketRepository();
    await seedFixtureMarkets(markets, NOW);
    const cache = new MemoryCacheStore({ now: () => NOW.getTime() });
    const built = makeTestApp({
      clock: { now: NOW.getTime() },
      markets,
      cache,
      env: { PUBLIC_APP_ORIGIN: 'https://app.windle.fun', PUBLIC_API_ORIGIN: 'https://api.windle.fun' },
    });
    app = built.app;
    return { app: built.app, cache };
  }

  it('serves a share page with Open Graph and X card tags that sends people to the app', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/v1/share/m/sprout-staking-v2' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    const html = res.body;
    const target = 'https://app.windle.fun/m/sprout-staking-v2';
    expect(meta(html, 'property', 'og:title')).toBe('Sprout deploys staking v2 to Solana mainnet by Friday.');
    expect(meta(html, 'property', 'og:url')).toBe(target);
    expect(meta(html, 'property', 'og:image')).toBe('https://api.windle.fun/v1/og/m/sprout-staking-v2.png?v=1-64-open');
    expect(meta(html, 'property', 'og:image:width')).toBe('1200');
    expect(meta(html, 'property', 'og:image:height')).toBe('630');
    expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'name', 'twitter:image')).toBe(meta(html, 'property', 'og:image'));
    expect(meta(html, 'property', 'og:description')).toContain('practice points');
    expect(html).toContain(`<link rel="canonical" href="${target}">`);
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=${target}">`);
    expect(html).toContain(`<a style="color:#43acfb" href="${target}">`);

    const missing = await app.inject({ method: 'GET', url: '/v1/share/m/no-such-market' });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain('url=https://app.windle.fun');
  });

  it('renders a 1200x630 PNG and caches it per odds', async () => {
    const { app, cache } = await setup();
    const res = await app.inject({ method: 'GET', url: '/v1/og/m/sprout-staking-v2.png?v=1-64-open' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(pngSize(res.rawPayload)).toEqual({ width: 1200, height: 630 });
    expect(await cache.get('og:1-64-open:sprout-staking-v2:-')).toEqual(res.rawPayload);

    const again = await app.inject({ method: 'GET', url: '/v1/og/m/sprout-staking-v2.png' });
    expect(again.rawPayload).toEqual(res.rawPayload);

    const missing = await app.inject({ method: 'GET', url: '/v1/og/m/nope.png' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<ApiError>().error.code).toBe('market_not_found');
  }, 60_000);
});
