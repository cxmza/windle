import {
  type ApiError,
  type ApiPortfolio,
  CandlesResponse,
  type CreateMarketRequest,
  CreateMarketResponse,
  LeaderboardResponse,
  MarketDetailResponse,
  MarketListResponse,
  ResolveResponse,
  STARTING_BALANCE_PTS,
  TradeResponse,
  type TweetSnapshot,
  XPost,
} from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ORIGIN, makeTestApp, newWallet, signIn, type Wallet } from '../test/helpers.ts';
import { XFeedHub } from '../x-feed/hub.ts';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const HOUR = 3_600_000;

function xPost(id: string, handle: string, text: string): XPost {
  return XPost.parse({
    id,
    kind: 'tweet',
    createdAt: '2026-10-11T10:00:00.000Z',
    receivedAt: '2026-10-11T10:00:01.000Z',
    url: `https://x.com/${handle}/status/${id}`,
    author: {
      id: '1',
      handle,
      name: 'Sprout Finance',
      avatarUrl: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
      followers: 10,
      tags: ['founder'],
    },
    text,
    media: [],
    quoted: null,
    inReplyTo: null,
    source: 'gmgn',
  });
}

/** A relay that knows the given posts; everything else is a JSON 404 ("not seen"), or the whole relay is down. */
function relay(known: XPost[] | 'echo' = [], down = false) {
  return new XFeedHub({
    relayUrl: 'http://relay.test',
    log: pino({ level: 'silent' }),
    fetch: async (input) => {
      if (down) throw new Error('connect ECONNREFUSED');
      const id = String(input).split('/post/')[1] ?? '';
      const hit =
        known === 'echo'
          ? xPost(id, 'sproutfi_dev', 'staking v2 ships friday, no more delays')
          : known.find((p) => p.id === id);
      if (hit) return new Response(JSON.stringify(hit));
      return new Response('{"error":"not seen"}', { status: 404, headers: { 'content-type': 'application/json' } });
    },
  });
}

let tweetSeq = 0;
function snapshot(handle = 'sproutfi_dev', text = 'staking v2 ships friday, no more delays'): TweetSnapshot {
  tweetSeq += 1;
  const id = `18468112000000${String(10_000 + tweetSeq)}`;
  return {
    id,
    url: `https://x.com/${handle}/status/${id}`,
    author: { handle, name: 'Sprout Finance' },
    text,
    createdAt: '2026-10-11T10:00:00.000Z',
    capturedAt: '2026-10-11T11:00:00.000Z',
  };
}

function createBody(source: TweetSnapshot, over: Partial<CreateMarketRequest> = {}): CreateMarketRequest {
  return {
    tweetUrl: source.url,
    statement: 'Sprout deploys staking v2 to Solana mainnet by Friday.',
    criteria: 'YES if staking v2 is deployed on Solana mainnet before the deadline.',
    deadline: new Date(NOW + 48 * HOUR).toISOString(),
    project: { name: 'Sproutfi', ticker: '$sprt' },
    initialProbYes: 0.6,
    source,
    ...over,
  };
}

describe('markets api', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function setup(opts: { env?: Record<string, string>; xFeed?: XFeedHub } = {}) {
    const admin = newWallet();
    const built = makeTestApp({
      env: { ADMIN_WALLETS: admin.address, ...opts.env },
      clock: { now: NOW },
      xFeed: opts.xFeed ?? relay('echo'),
    });
    app = built.app;
    const a = built.app;
    const session = async (wallet: Wallet = newWallet()) => (await signIn(a, wallet)).token;
    const send = (method: 'GET' | 'POST', url: string, token?: string, body?: unknown, origin = APP_ORIGIN) =>
      a.inject({
        method,
        url,
        headers: {
          origin,
          ...(token ? { cookie: `wl_session=${token}` } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
      });
    const create = async (token: string, source = snapshot(), over: Partial<CreateMarketRequest> = {}) => {
      const res = await send('POST', '/v1/markets', token, createBody(source, over));
      if (res.statusCode !== 201) throw new Error(`create: ${res.statusCode} ${res.body}`);
      return CreateMarketResponse.parse(res.json()).market;
    };
    return { ...built, admin, session, send, create };
  }

  it('requires a session and an allowed Origin for writes', async () => {
    const { send, session } = await setup();
    const body = createBody(snapshot());
    expect((await send('POST', '/v1/markets', undefined, body)).statusCode).toBe(401);
    const token = await session();
    const csrf = await send('POST', '/v1/markets', token, body, 'https://evil.example');
    expect(csrf.statusCode).toBe(403);
    expect(csrf.json<ApiError>().error.code).toBe('csrf_rejected');
    expect((await send('GET', '/v1/me/portfolio')).statusCode).toBe(401);
  });

  it('creates a community market at the requested odds; the creator sees it but cannot trade it', async () => {
    const { send, session, create } = await setup();
    const token = await session();
    const market = await create(token);
    expect(market).toMatchObject({
      slug: 'sprout-deploys-staking-v2-to-solana-mainnet',
      tier: 'community',
      status: 'open',
      tradable: true,
      volumePts: 0,
      traders: 0,
      tradeCount: 0,
      project: { name: 'Sproutfi', ticker: 'SPRT' },
      shareUrl: 'http://localhost:5174/s/sprout-deploys-staking-v2-to-solana-mainnet',
      viewer: { isCreator: true, canTrade: false, canResolve: true },
    });
    expect(market.probYes).toBeCloseTo(0.6, 12);
    const trade = await send('POST', `/v1/markets/${market.slug}/trades`, token, {
      action: 'buy',
      side: 'yes',
      amountPts: 10,
    });
    expect(trade.statusCode).toBe(403);
    expect(trade.json<ApiError>().error.code).toBe('creator_cannot_trade');
  });

  it('applies the wizard rules: deadline window, community only, one market per tweet', async () => {
    const { send, session, create } = await setup();
    const token = await session();
    const soon = await send(
      'POST',
      '/v1/markets',
      token,
      createBody(snapshot(), { deadline: new Date(NOW + 14 * 60_000).toISOString() }),
    );
    expect(soon.json<ApiError>().error.code).toBe('invalid_deadline');
    const quarter = await create(token, snapshot(), { deadline: new Date(NOW + 15 * 60_000).toISOString() });
    expect(quarter).toMatchObject({ deadline: new Date(NOW + 15 * 60_000).toISOString(), durationPreset: null });
    const backed = await send(
      'POST',
      '/v1/markets',
      token,
      createBody(snapshot(), { tier: 'backed', collateral: { amountSol: 10, check: 'on-chain check' } }),
    );
    expect(backed.json<ApiError>().error.code).toBe('market_tier_unsupported');
    const source = snapshot();
    const mismatch = await send('POST', '/v1/markets', token, {
      ...createBody(source),
      tweetUrl: 'https://x.com/someone_else/status/1846811200000099999',
    });
    expect(mismatch.json<ApiError>().error.code).toBe('tweet_mismatch');
    const first = await create(token, source);
    const dup = await send('POST', '/v1/markets', token, createBody(source));
    expect(dup.statusCode).toBe(409);
    expect(dup.json<ApiError>().error).toMatchObject({
      code: 'duplicate_tweet',
      details: { existingSlug: first.slug },
    });
  });

  it('closes at now + the duration preset, ignoring the deadline, and keeps the preset on the market', async () => {
    const { send, session, create } = await setup();
    const token = await session();
    const flash = await create(token, snapshot(), {
      durationPreset: 'flash',
      deadline: new Date(NOW + 30 * 24 * HOUR).toISOString(),
    });
    expect(flash).toMatchObject({ deadline: new Date(NOW + 15 * 60_000).toISOString(), durationPreset: 'flash' });
    const { deadline: _deadline, ...noDeadline } = createBody(snapshot());
    const month = await create(token, snapshot(), { ...noDeadline, durationPreset: 'month' });
    expect(month.deadline).toBe(new Date(NOW + 30 * 24 * HOUR).toISOString());
    const detail = MarketDetailResponse.parse((await send('GET', `/v1/markets/${flash.slug}`)).json());
    expect(detail.market.durationPreset).toBe('flash');

    const neither = await send('POST', '/v1/markets', token, noDeadline);
    expect(neither.statusCode).toBe(400);
    const unknown = await send('POST', '/v1/markets', token, { ...createBody(snapshot()), durationPreset: 'hourly' });
    expect(unknown.statusCode).toBe(400);
  });

  it('stores the server copy of the tweet when the feed has it and rejects a different author', async () => {
    const real = snapshot();
    const other = snapshot('impostor_x');
    const feed = [xPost(real.id, 'sproutfi_dev', 'the real text from X'), xPost(other.id, 'sproutfi_dev', 'x')];
    const { session, create, send } = await setup({ xFeed: relay(feed) });
    const token = await session();
    const market = await create(token, { ...real, text: 'forged text' });
    expect(market.source?.text).toBe('the real text from X');
    expect(market.source?.author.avatarUrl).toBe('https://pbs.twimg.com/profile_images/1/a_normal.jpg');
    const res = await send('POST', '/v1/markets', token, createBody(other));
    expect(res.json<ApiError>().error.code).toBe('tweet_mismatch');
  });

  it('refuses to create a market when the tweet cannot be checked on X', async () => {
    const { session, send } = await setup({ xFeed: relay([], true) });
    const res = await send('POST', '/v1/markets', await session(), createBody(snapshot()));
    expect(res.statusCode).toBe(503);
    expect(res.json<ApiError>().error.code).toBe('x_feed_unavailable');
  });

  it('trades, lists, shows detail with history, and keeps portfolio and leaderboard in step', async () => {
    const { send, session, create } = await setup();
    const creator = await session();
    const market = await create(creator);
    const alice = newWallet();
    const aliceToken = await session(alice);
    const bobToken = await session();

    const buy = await send('POST', `/v1/markets/${market.slug}/trades`, aliceToken, {
      action: 'buy',
      side: 'yes',
      amountPts: 100,
      minShares: 1,
    });
    expect(buy.statusCode).toBe(200);
    const bought = TradeResponse.parse(buy.json());
    expect(bought.balancePts).toBe(STARTING_BALANCE_PTS - 100);
    expect(bought.trade).toMatchObject({ action: 'buy', side: 'yes', costPts: 100, by: alice.address });
    expect(bought.market.probYes).toBeGreaterThan(market.probYes);
    expect(bought.market.viewer).toMatchObject({ isCreator: false, canTrade: true, canResolve: false });

    const poor = await send('POST', `/v1/markets/${market.slug}/trades`, bobToken, {
      action: 'buy',
      side: 'no',
      amountPts: STARTING_BALANCE_PTS + 1,
    });
    expect(poor.json<ApiError>().error.code).toBe('insufficient_balance');
    await send('POST', `/v1/markets/${market.slug}/trades`, bobToken, { action: 'buy', side: 'no', amountPts: 20 });

    const sell = await send('POST', `/v1/markets/${market.slug}/trades`, aliceToken, {
      action: 'sell',
      side: 'yes',
      shares: bought.trade.shares / 2,
    });
    expect(sell.statusCode).toBe(200);

    const detail = MarketDetailResponse.parse((await send('GET', `/v1/markets/${market.slug}`, aliceToken)).json());
    expect(detail.trades.map((t) => t.action)).toEqual(['sell', 'buy', 'buy']);
    expect(detail.history).toHaveLength(4);
    expect(detail.history[0]?.p).toBeCloseTo(0.6, 12);
    expect(detail.position?.yesShares).toBeCloseTo(bought.trade.shares / 2, 9);
    expect(detail.market.tradeCount).toBe(3);
    expect(detail.market.traders).toBe(2);
    expect(detail.market.stats).toEqual({
      change24hPp: (detail.market.probYes - 0.6) * 100,
      buys: 2,
      sells: 1,
      botTrades: 0,
      humanTraders: 2,
    });

    const anonymous = MarketDetailResponse.parse((await send('GET', `/v1/markets/${market.slug}`)).json());
    expect(anonymous.position).toBeNull();
    expect(anonymous.market.viewer).toBeUndefined();

    const list = MarketListResponse.parse((await send('GET', '/v1/markets?status=open&sort=volume')).json());
    expect(list.total).toBe(1);
    expect(list.nextOffset).toBeNull();
    expect(list.markets[0]?.stats).toEqual(detail.market.stats);
    expect(list.markets[0]?.durationPreset).toBeNull();
    expect((await send('GET', '/v1/markets?status=settled')).json<{ total: number }>().total).toBe(0);
    expect((await send('GET', '/v1/markets/nope')).json<ApiError>().error.code).toBe('market_not_found');

    const portfolio = (await send('GET', '/v1/me/portfolio', aliceToken)).json<ApiPortfolio>();
    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.markets.map((m) => m.slug)).toEqual([market.slug]);
    expect(portfolio.history).toHaveLength(2);
    expect(portfolio.netWorthPts).toBeCloseTo(portfolio.balancePts + portfolio.openValuePts, 9);
    expect(portfolio.rank).not.toBeNull();

    const board = LeaderboardResponse.parse((await send('GET', '/v1/leaderboard', aliceToken)).json());
    expect(board.rankedTraders).toBe(2);
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(board.me).toMatchObject({ address: alice.address, rank: portfolio.rank, marketsTraded: 1 });
    const creatorBoard = LeaderboardResponse.parse((await send('GET', '/v1/leaderboard', creator)).json());
    expect(creatorBoard.me).toMatchObject({ rank: null, netWorthPts: STARTING_BALANCE_PTS, marketsTraded: 0 });
    expect(LeaderboardResponse.parse((await send('GET', '/v1/leaderboard')).json()).me).toBeNull();
  });

  it('resolves with automatic settlement, idempotently, for the creator or an admin only', async () => {
    const { send, session, create, admin, clock } = await setup();
    const creator = await session();
    const market = await create(creator);
    const aliceToken = await session();
    const bobToken = await session();
    const yes = TradeResponse.parse(
      (
        await send('POST', `/v1/markets/${market.slug}/trades`, aliceToken, {
          action: 'buy',
          side: 'yes',
          amountPts: 50,
        })
      ).json(),
    );
    await send('POST', `/v1/markets/${market.slug}/trades`, bobToken, { action: 'buy', side: 'no', amountPts: 50 });

    const stranger = await send('POST', `/v1/markets/${market.slug}/resolve`, aliceToken, { outcome: 'yes' });
    expect(stranger.json<ApiError>().error.code).toBe('forbidden');
    const early = await send('POST', `/v1/markets/${market.slug}/resolve`, creator, { outcome: 'no' });
    expect(early.json<ApiError>().error.code).toBe('resolve_too_early');

    clock.now = NOW + HOUR;
    const res = await send('POST', `/v1/markets/${market.slug}/resolve`, creator, {
      outcome: 'yes',
      note: 'Mainnet program deployed, tx 5x…',
    });
    expect(res.statusCode).toBe(200);
    const done = ResolveResponse.parse(res.json());
    expect(done.alreadyResolved).toBe(false);
    expect(done.settlement).toMatchObject({ outcome: 'yes', method: 'creator', positions: 2 });
    expect(done.settlement.payoutPts).toBeCloseTo(yes.trade.shares, 5);
    expect(done.market).toMatchObject({ status: 'resolved', tradable: false });
    expect(done.market.resolution).toMatchObject({
      method: 'creator',
      finalOutcome: 'yes',
      evidence: [{ kind: 'note', text: 'Mainnet program deployed, tx 5x…' }],
    });

    const again = ResolveResponse.parse(
      (await send('POST', `/v1/markets/${market.slug}/resolve`, creator, { outcome: 'yes' })).json(),
    );
    expect(again.alreadyResolved).toBe(true);
    const adminToken = await session(admin);
    const flip = await send('POST', `/v1/markets/${market.slug}/resolve`, adminToken, { outcome: 'no' });
    expect(flip.json<ApiError>().error.code).toBe('market_already_resolved');

    const portfolio = (await send('GET', '/v1/me/portfolio', aliceToken)).json<ApiPortfolio>();
    expect(portfolio.positions[0]).toMatchObject({ claimed: true, valuePts: 0, costBasisPts: 0 });
    expect(portfolio.balancePts).toBeCloseTo(STARTING_BALANCE_PTS - 50 + yes.trade.shares, 5);
    const closedTrade = await send('POST', `/v1/markets/${market.slug}/trades`, bobToken, {
      action: 'buy',
      side: 'no',
      amountPts: 5,
    });
    expect(closedTrade.json<ApiError>().error.code).toBe('market_closed');

    const other = await create(creator, snapshot());
    const byAdmin = ResolveResponse.parse(
      (await send('POST', `/v1/markets/${other.slug}/resolve`, adminToken, { outcome: 'void' })).json(),
    );
    expect(byAdmin.settlement).toMatchObject({ method: 'admin', positions: 0, payoutPts: 0 });
    expect(byAdmin.market.status).toBe('voided');
  });

  it('serves gap-filled candles per side, cached briefly, 404 for an unknown market', async () => {
    const { send, session, create, clock } = await setup();
    const market = await create(await session());
    const alice = await session();
    const buy = (side: 'yes' | 'no', amountPts: number) =>
      send('POST', `/v1/markets/${market.slug}/trades`, alice, { action: 'buy', side, amountPts });
    clock.now = NOW + 30_000;
    const first = TradeResponse.parse((await buy('yes', 50)).json());
    clock.now = NOW + 3 * 60_000 + 10_000;
    const second = TradeResponse.parse((await buy('no', 20)).json());
    clock.now = NOW + 4 * 60_000 + 30_000;

    const res = await send('GET', `/v1/markets/${market.slug}/candles?tf=1m`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=2');
    const yes = CandlesResponse.parse(res.json());
    const sec = NOW / 1000;
    expect(yes).toMatchObject({ tf: '1m', side: 'yes', from: sec, to: sec + 270 });
    expect(yes.candles.map((c) => c.n)).toEqual([1, 0, 0, 1, 0]);
    expect(yes.candles[0]).toMatchObject({ o: 0.6, c: first.trade.priceAfter, v: 50, vBot: 0 });
    expect(yes.candles[3]).toMatchObject({ o: first.trade.priceAfter, c: second.trade.priceAfter, v: 20 });
    expect(yes.candles.at(-1)?.c).toBe(second.market.probYes);

    const no = CandlesResponse.parse((await send('GET', `/v1/markets/${market.slug}/candles?tf=1m&side=no`)).json());
    expect(no.side).toBe('no');
    expect(no.candles[0]?.o).toBeCloseTo(0.4, 12);
    expect(no.candles[0]?.h).toBeCloseTo(1 - (yes.candles[0]?.l ?? 0), 12);

    const tail = CandlesResponse.parse((await send('GET', `/v1/markets/${market.slug}/candles?tf=1m&limit=2`)).json());
    expect(tail.candles.map((c) => c.t)).toEqual([sec + 180, sec + 240]);
    expect(tail.from).toBe(sec + 180);

    await buy('yes', 10);
    const cached = CandlesResponse.parse((await send('GET', `/v1/markets/${market.slug}/candles?tf=1m`)).json());
    expect(cached.candles.reduce((n, c) => n + c.n, 0)).toBe(2);
    clock.now += 5000;
    const fresh = CandlesResponse.parse((await send('GET', `/v1/markets/${market.slug}/candles?tf=1m`)).json());
    expect(fresh.candles.reduce((n, c) => n + c.n, 0)).toBe(3);

    expect((await send('GET', `/v1/markets/${market.slug}/candles?tf=2m`)).statusCode).toBe(400);
    expect((await send('GET', `/v1/markets/${market.slug}/candles?limit=1001`)).statusCode).toBe(400);
    const missing = await send('GET', '/v1/markets/nope/candles');
    expect(missing.json<ApiError>().error.code).toBe('market_not_found');
    expect(missing.headers['cache-control']).toBe('no-store');
  });

  it('limits market creation per user', async () => {
    const { send, session, create } = await setup({ env: { MARKET_CREATE_PER_HOUR: '2' } });
    const token = await session();
    await create(token);
    await create(token);
    const third = await send('POST', '/v1/markets', token, createBody(snapshot()));
    expect(third.statusCode).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
    const otherUser = await session();
    await create(otherUser);
  });

  it('documents every market route in OpenAPI with the session scheme on writes', async () => {
    const { send } = await setup();
    const doc = (await send('GET', '/openapi.json')).json<{
      paths: Record<string, Record<string, { security?: unknown; tags?: string[] }>>;
    }>();
    for (const path of ['/v1/markets', '/v1/markets/{slug}/trades', '/v1/markets/{slug}/resolve']) {
      expect(doc.paths[path]?.post?.security).toEqual([{ session: [] }]);
    }
    expect(doc.paths['/v1/me/portfolio']?.get?.security).toEqual([{ session: [] }]);
    expect(doc.paths['/v1/leaderboard']?.get?.tags).toEqual(['Markets']);
    expect(doc.paths['/v1/markets/{slug}/candles']?.get?.tags).toEqual(['Markets']);
    expect(doc.paths['/v1/share/m/{slug}']?.get?.tags).toEqual(['Share']);
  });
});
