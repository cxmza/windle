import {
  ApiError,
  type ApiImage,
  type ApiMarket,
  ApiPortfolio,
  type ApiTrade,
  Candle,
  CandlesQuery,
  CandlesResponse,
  CreateMarketRequest,
  CreateMarketResponse,
  LeaderboardEntry,
  type LeaderboardMe,
  LeaderboardResponse,
  MarketDetailResponse,
  MarketListQuery,
  MarketListResponse,
  MarketSlug,
  type PricePoint,
  ResolveRequest,
  ResolveResponse,
  STARTING_BALANCE_PTS,
  TradeRequest,
  TradeResponse,
} from '@windle/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type ActiveSession, readSession, renewSession, requireSession } from '../auth/session.ts';
import type { AppContext } from '../context.ts';
import { dep, HttpError } from '../errors.ts';
import { buildCandles, candlesForSide, candleWindow } from '../markets/candles.ts';
import { fromMicro } from '../markets/engine.ts';
import { checkCreateRequest, createMarket, duplicateError, executeTrade, resolveMarket } from '../markets/service.ts';
import { verifySource } from '../markets/source.ts';
import { marketStats } from '../markets/stats.ts';
import type { LeaderRow, MarketRecord, TradeRecord } from '../markets/types.ts';
import { toApiMarket, toApiPosition, toApiTrade, type Viewer } from '../markets/view.ts';

const SlugParams = z.object({ slug: MarketSlug });
const LEADERBOARD_SIZE = 100;
const LEADERBOARD_KEY = 'lb:top:v2';
const HISTORY_POINTS = 500;
const CANDLES_CACHE = 'public, max-age=2';

const CachedCandles = z.object({ candles: z.array(Candle), from: z.number().int(), to: z.number().int() });

/** Cached without avatars (joined per request, so a takedown shows at once); `userId` is for that join. */
const CachedTop = z.object({
  entries: z.array(LeaderboardEntry.extend({ userId: z.string() })),
  rankedTraders: z.number().int(),
  updatedAt: z.string(),
});

const readErrors = { 400: ApiError, 404: ApiError, 429: ApiError, 503: ApiError };
const writeErrors = {
  400: ApiError,
  401: ApiError,
  403: ApiError,
  404: ApiError,
  409: ApiError,
  410: ApiError,
  415: ApiError,
  422: ApiError,
  429: ApiError,
  503: ApiError,
};

const SETTLEMENT_NOTE =
  'Settlement is automatic: resolving pays every position in the same transaction (1 pt per winning share, the ' +
  'cost basis back when voided). There is no claim step; positions come back with `claimed: true`.';

function netWorthPts(r: LeaderRow) {
  return fromMicro(r.balanceMicro) + r.openValuePts;
}

function toEntry(r: LeaderRow, rank: number): LeaderboardEntry {
  const netWorth = netWorthPts(r);
  return {
    rank,
    address: r.address ?? '',
    netWorthPts: netWorth,
    balancePts: fromMicro(r.balanceMicro),
    openValuePts: r.openValuePts,
    pnlPts: netWorth - STARTING_BALANCE_PTS,
    marketsTraded: r.marketsTraded,
  };
}

export async function marketRoutes(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const repo = ctx.markets;
  const { adminWallets, createPerHour, tradePerMinute, leaderboardCacheSeconds, candlesCacheSeconds } =
    ctx.config.markets;
  const appOrigin = ctx.config.publicAppOrigin;
  const userOf = new WeakMap<FastifyRequest, string>();

  const perUser = (name: string, max: number, timeWindow: number) => {
    const limit = app.createRateLimit({
      max,
      timeWindow,
      keyGenerator: (request) => `${name}:${userOf.get(request) ?? request.clientIp}`,
    });
    return async (request: FastifyRequest, session: ActiveSession) => {
      userOf.set(request, session.record.userId);
      const res = await limit(request);
      if (!res.isAllowed && res.isExceeded) {
        const retry = String(Math.max(1, res.ttlInSeconds));
        throw new HttpError(429, 'rate_limited', `Too many requests, retry in ${retry}s`, { 'retry-after': retry });
      }
    };
  };
  const createLimit = perUser('mkt-create', createPerHour, 3_600_000);
  const tradeLimit = perUser('mkt-trade', tradePerMinute, 60_000);
  const resolveLimit = perUser('mkt-resolve', 30, 60_000);

  const viewerOf = (session: ActiveSession | null): Viewer | null =>
    session ? { userId: session.record.userId, isAdmin: adminWallets.has(session.record.address) } : null;

  const optionalViewer = async (request: FastifyRequest) => {
    const { session } = await readSession(request, ctx);
    return session;
  };

  const statsOf = (markets: readonly MarketRecord[]) => dep('postgres', () => marketStats(repo, markets, ctx.now()));
  const imagesOf = (markets: readonly MarketRecord[]) =>
    dep('postgres', () => ctx.media.images(markets.map((m) => m.imageId)));
  const imageOf = (m: MarketRecord, images: Map<string, ApiImage>) =>
    m.imageId === null ? null : (images.get(m.imageId) ?? null);
  const views = async (markets: readonly MarketRecord[], viewer: Viewer | null): Promise<ApiMarket[]> => {
    const [stats, images] = await Promise.all([statsOf(markets), imagesOf(markets)]);
    return markets.map((m) => toApiMarket(m, ctx.now(), appOrigin, viewer, stats.get(m.id), imageOf(m, images)));
  };
  const viewOne = async (m: MarketRecord, viewer: Viewer | null) => (await views([m], viewer))[0] as ApiMarket;
  const tradesView = async (trades: readonly TradeRecord[]): Promise<ApiTrade[]> => {
    const avatars = await dep('postgres', () => ctx.media.avatars([...new Set(trades.map((t) => t.userId))]));
    return trades.map((t) => toApiTrade(t, avatars.get(t.userId) ?? null));
  };

  async function history(m: MarketRecord): Promise<PricePoint[]> {
    const points = await dep('postgres', () => repo.pricePoints(m.id, HISTORY_POINTS));
    const out: PricePoint[] = [{ t: m.createdAt.getTime(), p: m.openProbYes }];
    for (const point of points) out.push({ t: Math.max(point.at.getTime(), out.at(-1)?.t ?? 0), p: point.p });
    const end = Math.min(ctx.now().getTime(), (m.resolvedAt ?? m.closesAt).getTime());
    const last = out.at(-1);
    if (last && end > last.t) out.push({ t: end, p: m.probYes });
    return out;
  }

  r.get(
    '/v1/markets',
    {
      schema: {
        tags: ['Markets'],
        summary: 'List markets',
        description:
          'Markets with their LMSR state and current prices. Signed-in callers also get `viewer` flags per market ' +
          '(e.g. `canTrade` is false on markets they created). `traders` counts people only; `volumePts` and ' +
          '`tradeCount` include the labelled house market bots, whose share is `botVolumePts` / `botTradeCount`.',
        querystring: MarketListQuery,
        response: { 200: MarketListResponse, ...readErrors },
      },
    },
    async (request) => {
      const q = request.query;
      const viewer = viewerOf(await optionalViewer(request));
      const { markets, total } = await dep('postgres', () =>
        repo.listMarkets({
          status: q.status,
          tier: q.tier,
          sort: q.sort,
          limit: q.limit,
          offset: q.offset,
          now: ctx.now(),
        }),
      );
      const next = q.offset + markets.length;
      return { markets: await views(markets, viewer), total, nextOffset: next < total ? next : null };
    },
  );

  r.get(
    '/v1/markets/:slug',
    {
      schema: {
        tags: ['Markets'],
        summary: 'Get a market',
        description:
          "One market with its latest trades, a price history for the chart and the viewer's position. Trades by " +
          'house market bots carry `bot: true` and a `botName`.',
        params: SlugParams,
        response: { 200: MarketDetailResponse, ...readErrors },
      },
    },
    async (request) => {
      const session = await optionalViewer(request);
      const viewer = viewerOf(session);
      const m = await dep('postgres', () => repo.marketBySlug(request.params.slug));
      if (!m) throw new HttpError(404, 'market_not_found', 'No market with this slug');
      const [trades, points, position, market] = await Promise.all([
        dep('postgres', () => repo.recentTrades(m.id, 50)).then(tradesView),
        history(m),
        viewer ? dep('postgres', () => repo.position(viewer.userId, m.id)) : Promise.resolve(null),
        viewOne(m, viewer),
      ]);
      return {
        market,
        trades,
        history: points,
        position: position ? toApiPosition(position, m) : null,
      };
    },
  );

  async function yesCandles(m: MarketRecord, tf: CandlesResponse['tf'], limit: number) {
    const key = `candles:v1:${m.id}:${tf}:${limit}`;
    if (candlesCacheSeconds > 0) {
      const raw = await ctx.cache.get(key).catch(() => null);
      if (raw) {
        const parsed = CachedCandles.safeParse(JSON.parse(raw.toString('utf8')));
        if (parsed.success) return parsed.data;
      }
    }
    const window = candleWindow(m, tf, limit, ctx.now());
    const { before, buckets } = await dep('postgres', () => repo.tradeBuckets(m.id, window));
    const fresh = { candles: buildCandles(m, window, before, buckets), from: window.fromSec, to: window.endSec };
    if (candlesCacheSeconds > 0)
      await ctx.cache.set(key, Buffer.from(JSON.stringify(fresh)), candlesCacheSeconds).catch(() => {});
    return fresh;
  }

  r.get(
    '/v1/markets/:slug/candles',
    {
      schema: {
        tags: ['Markets'],
        summary: 'Price candles',
        description: [
          'OHLC candles of the price of one side (probability 0..1) with volume, built from every trade, house market ' +
            'bots included (their part is `vBot` / `nBot`). Buckets are `tf` long and aligned to the Unix epoch ' +
            '(UTC); `t` is the bucket start in Unix seconds.',
          '',
          'Each candle opens at the previous close; the first candle of a market opens at its opening price. ' +
            'Buckets without trades are flat candles at the previous close with `v: 0`, so the series has no gaps ' +
            'from the creation of the market to now (to the close, or the resolution, once trading has stopped). ' +
            'Only the `limit` most recent buckets are returned.',
          '',
          '`side=no` returns 1 - the YES price (high and low swap). Cached for a few seconds.',
        ].join('\n'),
        params: SlugParams,
        querystring: CandlesQuery,
        response: { 200: CandlesResponse, ...readErrors },
      },
    },
    async (request, reply) => {
      const { tf, side, limit } = request.query;
      const m = await dep('postgres', () => repo.marketBySlug(request.params.slug));
      if (!m) throw new HttpError(404, 'market_not_found', 'No market with this slug');
      const yes = await yesCandles(m, tf, limit);
      reply.header('cache-control', CANDLES_CACHE);
      return { tf, side, candles: candlesForSide(yes.candles, side), from: yes.from, to: yes.to };
    },
  );

  r.post(
    '/v1/markets',
    {
      // A video tweet's snapshot (media variants, card) can outgrow the 16 KB default body limit.
      bodyLimit: 64 * 1024,
      schema: {
        tags: ['Markets'],
        summary: 'Create a market',
        description: [
          'Creates a community market from a tweet. Same rules as the create wizard: the market closes 15 ' +
            'minutes to 1 year ahead (`422 invalid_deadline`), one market per tweet (`409 duplicate_tweet` with ' +
            '`details.existingSlug`). `tweetUrl` must be the link of `source` (send `source.url`).',
          '',
          'Closing time: with `durationPreset` (an id of `DURATION_PRESETS`: flash 15m, fast 1h, slow 4h, day 24h, ' +
            'week 7d, month 30d) the market closes at now + that duration and `deadline` is ignored; otherwise ' +
            '`deadline` is required. The preset is kept on the market as `durationPreset`.',
          '',
          'The server re-reads the tweet from the X feed or X itself and stores its own copy; a post X does not ' +
            'know is `404 tweet_not_found`, another author is `422 tweet_mismatch`, a repost is `422 invalid_tweet_url`. When X ' +
            'cannot be asked the request is refused with `503 x_feed_unavailable`; retry later.',
          '',
          'The creator cannot trade on the market (`403 creator_cannot_trade`) and resolves it later with ' +
            '`POST /v1/markets/{slug}/resolve`. Limited per user per hour (`429 rate_limited`).',
          '',
          'Optional `imageId`: an image the creator uploaded (`POST /v1/media`), returned as `market.image`. ' +
            '`404 media_not_found`, `403 media_not_owned`, `410 media_removed`.',
        ].join('\n'),
        security: [{ session: [] }],
        body: CreateMarketRequest,
        response: { 201: CreateMarketResponse, ...writeErrors },
      },
    },
    async (request, reply) => {
      const session = await requireSession(request, reply, ctx);
      const now = ctx.now();
      const body = request.body;
      checkCreateRequest(body, now);
      await createLimit(request, session);
      const existing = await dep('postgres', () => repo.marketBySourceTweet(body.source.id));
      if (existing) throw duplicateError(existing);
      const { snapshot } = await verifySource(ctx, body.source, now);
      const creator = { userId: session.record.userId, address: session.record.address };
      const imageId = body.imageId;
      if (imageId !== undefined) await dep('postgres', () => ctx.media.attachable(imageId, creator.userId));
      const market = await dep('postgres', () => createMarket(repo, body, snapshot, creator, now));
      await renewSession(reply, ctx, session);
      return reply.code(201).send({ market: await viewOne(market, viewerOf(session)) });
    },
  );

  r.post(
    '/v1/markets/:slug/trades',
    {
      schema: {
        tags: ['Markets'],
        summary: 'Buy or sell shares',
        description: [
          'Prices with the LMSR in `@windle/shared` inside one transaction (market and account rows locked).',
          '',
          '- `buy`: spend `amountPts` on `side`; optional `minShares` guards against price moves.',
          '- `sell`: return `shares` of `side` to the pool; optional `minProceedsPts`.',
          '',
          'House market bots (when enabled) trade the same way, labelled `bot: true` with a `botName`; they are not ' +
            'people, are never ranked and are not counted in `traders`.',
          '',
          'Errors: `409 market_closed` (deadline passed or settled), `403 creator_cannot_trade`, ' +
            '`422 insufficient_balance` / `insufficient_shares` / `invalid_amount` / `slippage_exceeded` ' +
            '(`details` carries the current quote), `429 rate_limited` (per user per minute).',
        ].join('\n'),
        security: [{ session: [] }],
        params: SlugParams,
        body: TradeRequest,
        response: { 200: TradeResponse, ...writeErrors },
      },
    },
    async (request, reply) => {
      const session = await requireSession(request, reply, ctx);
      await tradeLimit(request, session);
      const done = await dep('postgres', () =>
        executeTrade(repo, {
          slug: request.params.slug,
          userId: session.record.userId,
          walletAddress: session.record.address,
          request: request.body,
          now: ctx.now(),
          anchorAlpha: ctx.config.bots.anchorAlpha,
        }),
      );
      await renewSession(reply, ctx, session);
      const [[trade], market] = await Promise.all([tradesView([done.trade]), viewOne(done.market, viewerOf(session))]);
      return {
        trade: trade as ApiTrade,
        market,
        position: toApiPosition(done.position, done.market),
        balancePts: fromMicro(done.account.balanceMicro),
      };
    },
  );

  r.post(
    '/v1/markets/:slug/resolve',
    {
      schema: {
        tags: ['Markets'],
        summary: 'Resolve and settle a market',
        description: [
          "For the market's creator or an admin wallet (`ADMIN_WALLETS`), otherwise `403 forbidden`. Admins may " +
            'resolve any outcome at any time; the creator may resolve `yes` or `void` at any time and `no` only ' +
            'after the deadline (`409 resolve_too_early`). Trading stops at once.',
          '',
          SETTLEMENT_NOTE,
          '',
          'Idempotent: repeating the same outcome returns the first settlement with `alreadyResolved: true`; a ' +
            'different outcome on a settled market is `409 market_already_resolved`.',
        ].join('\n'),
        security: [{ session: [] }],
        params: SlugParams,
        body: ResolveRequest,
        response: { 200: ResolveResponse, ...writeErrors },
      },
    },
    async (request, reply) => {
      const session = await requireSession(request, reply, ctx);
      await resolveLimit(request, session);
      const viewer = viewerOf(session);
      const done = await dep('postgres', () =>
        resolveMarket(repo, {
          slug: request.params.slug,
          userId: session.record.userId,
          walletAddress: session.record.address,
          isAdmin: viewer?.isAdmin ?? false,
          outcome: request.body.outcome,
          note: request.body.note ?? null,
          now: ctx.now(),
        }),
      );
      await renewSession(reply, ctx, session);
      return {
        market: await viewOne(done.market, viewer),
        alreadyResolved: done.alreadyResolved,
        settlement: { ...done.settlement, resolvedAt: done.settlement.resolvedAt.toISOString() },
      };
    },
  );

  r.get(
    '/v1/me/portfolio',
    {
      schema: {
        tags: ['Markets'],
        summary: 'Get my portfolio',
        description:
          'Balance, positions marked to market, net worth, rank and own trade history. The practice account is ' +
          `created on first use with ${STARTING_BALANCE_PTS} points. ${SETTLEMENT_NOTE}`,
        security: [{ session: [] }],
        response: { 200: ApiPortfolio, 401: ApiError, 429: ApiError, 503: ApiError },
      },
    },
    async (request, reply) => {
      const session = await requireSession(request, reply, ctx);
      const userId = session.record.userId;
      const now = ctx.now();
      const account = await dep('postgres', () => repo.ensureAccount(userId, now));
      const [positions, trades, leader] = await Promise.all([
        dep('postgres', () => repo.userPositions(userId)),
        dep('postgres', () => repo.userTrades(userId, 100)),
        dep('postgres', () => repo.leaderRow(userId)),
      ]);
      const markets = await dep('postgres', () => repo.marketsByIds(positions.map((p) => p.marketId)));
      const byId = new Map(markets.map((m) => [m.id, m]));
      const viewer = viewerOf(session);
      const apiPositions = positions.flatMap((p) => {
        const m = byId.get(p.marketId);
        return m ? [toApiPosition(p, m)] : [];
      });
      const openValuePts = apiPositions.reduce((sum, p) => sum + p.valuePts, 0);
      const balancePts = fromMicro(account.balanceMicro);
      await renewSession(reply, ctx, session);
      return {
        balancePts,
        startingBalancePts: STARTING_BALANCE_PTS,
        openValuePts,
        netWorthPts: balancePts + openValuePts,
        pnlPts: balancePts + openValuePts - STARTING_BALANCE_PTS,
        rank: leader?.rank ?? null,
        positions: apiPositions,
        markets: await views(markets, viewer),
        history: await tradesView(trades),
      };
    },
  );

  async function top(): Promise<z.infer<typeof CachedTop>> {
    if (leaderboardCacheSeconds > 0) {
      const raw = await ctx.cache.get(LEADERBOARD_KEY).catch(() => null);
      if (raw) {
        const parsed = CachedTop.safeParse(JSON.parse(raw.toString('utf8')));
        if (parsed.success) return parsed.data;
      }
    }
    const { rows, ranked } = await dep('postgres', () => repo.leaderboard(LEADERBOARD_SIZE));
    const fresh = {
      entries: rows.map((row) => ({ ...toEntry(row, row.rank ?? 1), userId: row.userId })),
      rankedTraders: ranked,
      updatedAt: ctx.now().toISOString(),
    };
    if (leaderboardCacheSeconds > 0)
      await ctx.cache.set(LEADERBOARD_KEY, Buffer.from(JSON.stringify(fresh)), leaderboardCacheSeconds).catch(() => {});
    return fresh;
  }

  r.get(
    '/v1/leaderboard',
    {
      schema: {
        tags: ['Markets'],
        summary: 'Leaderboard',
        description:
          'Top 100 traders by net worth (balance + open shares at current prices). Only accounts with at least ' +
          'one trade are ranked; ties share a rank. House market bots are never ranked. The list is cached for a ' +
          'few seconds (`updatedAt`); `me` (the signed-in caller) is always live.',
        response: { 200: LeaderboardResponse, ...readErrors },
      },
    },
    async (request) => {
      const session = await optionalViewer(request);
      const list = await top();
      const avatars = await dep('postgres', () =>
        ctx.media.avatars([...list.entries.map((e) => e.userId), ...(session ? [session.record.userId] : [])]),
      );
      const entries = list.entries.map(({ userId, ...entry }) => ({ ...entry, avatar: avatars.get(userId) ?? null }));
      let me: LeaderboardMe | null = null;
      if (session) {
        const row = await dep('postgres', () => repo.leaderRow(session.record.userId));
        const avatar = avatars.get(session.record.userId) ?? null;
        me = row
          ? { ...toEntry(row, 1), address: row.address ?? session.record.address, rank: row.rank, avatar }
          : {
              avatar,
              rank: null,
              address: session.record.address,
              netWorthPts: STARTING_BALANCE_PTS,
              balancePts: STARTING_BALANCE_PTS,
              openValuePts: 0,
              pnlPts: 0,
              marketsTraded: 0,
            };
      }
      return { ...list, entries, me, startingBalancePts: STARTING_BALANCE_PTS };
    },
  );
}
