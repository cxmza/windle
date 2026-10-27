import {
  type ApiImage,
  type ApiMarket,
  type ApiPortfolio,
  type ApiPosition,
  type ApiTrade,
  CANDLE_TIMEFRAME_SECONDS,
  type Candle,
  type CandlesResponse,
  CandleTimeframe,
  type DurationPresetId,
  durationPresetOf,
  inventoryForPrice,
  type LeaderboardResponse,
  lmsrPriceYes,
  type MarketDetailResponse,
  type MarketSide,
  type PricePoint,
  type ProposedOutcome,
  proceedsForShares,
  quote,
  type TweetSnapshot,
  withShares,
} from '@windle/shared';
import { vi } from 'vitest';

export const WALLET = '7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy';
export const OTHER_WALLET = 'So11111111111111111111111111111111111111112';
export const USER_ID = '0b8f3c0e-6a51-4d47-9a8e-2f4c1d7b9e10';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function makeTweet(id: string, over: Partial<TweetSnapshot> = {}): TweetSnapshot {
  const at = new Date(Date.now() - HOUR).toISOString();
  return {
    id,
    url: `https://x.com/sproutfi_dev/status/${id}`,
    author: { handle: 'sproutfi_dev', name: 'Sprout' },
    text: 'Staking v2 ships to mainnet next week.',
    createdAt: at,
    capturedAt: at,
    ...over,
  };
}

type MarketOverrides = Partial<Omit<ApiMarket, 'probYes'>> & { prob?: number };

let counter = 0;

/** An open community market, three days from its deadline, priced at 50% unless `prob` says otherwise. */
export function makeMarket({ prob = 0.5, ...over }: MarketOverrides = {}): ApiMarket {
  counter += 1;
  const b = over.liquidityB ?? 50;
  const inv = inventoryForPrice(prob, b);
  const slug = over.slug ?? `sprout-ships-staking-v2-${counter}`;
  const now = Date.now();
  return {
    id: `market-${counter}`,
    slug,
    tier: 'community',
    status: 'open',
    project: { slug: 'sprout', name: 'Sprout', ticker: 'SPRT' },
    statement: `Sprout ships staking v2 (${counter})`,
    criteria: 'Staking v2 is live on mainnet and linked from the official docs.',
    deadline: new Date(now + 3 * DAY).toISOString(),
    createdAt: new Date(now - DAY).toISOString(),
    creator: OTHER_WALLET,
    source: makeTweet(`19000000000000${String(1000 + counter)}`),
    liquidityB: b,
    qYes: inv.yes,
    qNo: inv.no,
    probYes: lmsrPriceYes(inv, b),
    volumePts: 0,
    traders: 0,
    tradable: true,
    tradeCount: 0,
    shareUrl: `https://app.windle.fun/s/${slug}`,
    ...over,
  };
}

export const ISO = (ms: number): string => new Date(ms).toISOString();

/** A final resolution by the creator (or an admin), as the api reports it. */
export function makeResolution(outcome: ProposedOutcome, method: 'creator' | 'admin' = 'creator', note?: string) {
  const at = ISO(Date.now() - HOUR);
  return {
    method,
    proposedOutcome: outcome,
    evidence: note ? [{ kind: 'note' as const, text: note }] : [],
    proposedAt: at,
    disputeEndsAt: at,
    disputes: [],
    finalOutcome: outcome,
    resolvedAt: at,
  };
}

/** A market that already settled, deadline in the past. */
export function makeSettled(outcome: ProposedOutcome, over: MarketOverrides = {}): ApiMarket {
  return makeMarket({
    status: outcome === 'void' ? 'voided' : 'resolved',
    tradable: false,
    deadline: ISO(Date.now() - DAY),
    resolution: makeResolution(outcome),
    ...over,
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const failure = (status: number, code: string, message: string, details?: Record<string, string>): Response =>
  json({ error: { code, message, ...(details ? { details } : {}) } }, status);

export interface FakeApiOptions {
  markets?: readonly ApiMarket[];
  balance?: number;
  isAdmin?: boolean;
  leaderboard?: Partial<LeaderboardResponse>;
  /** Positions the viewer already holds, by market slug. */
  positions?: Record<string, Partial<ApiPosition>>;
}

export interface FakeCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/**
 * A small in-memory stand-in for the exchange api, speaking the real contract: the same LMSR, the same error codes
 * and the same resolve rules. Install it with `fake.install()`; it replaces the global `fetch` for the test.
 */
export class FakeApi {
  markets = new Map<string, ApiMarket>();
  trades = new Map<string, ApiTrade[]>();
  history = new Map<string, PricePoint[]>();
  /** Candles a test wants served as they are; without an entry they are derived from `history` and `trades`. */
  candles = new Map<string, Candle[]>();
  positions = new Map<string, ApiPosition>();
  balance: number;
  isAdmin: boolean;
  /** The viewer's avatar; `PUT /v1/me/avatar` only accepts ids registered in `images`. */
  avatar: ApiImage | null = null;
  images = new Map<string, ApiImage>();
  reportedImages = new Set<string>();
  calls: FakeCall[] = [];
  leaderboard: LeaderboardResponse;
  sessionAddress = WALLET;
  failNext: Response | null = null;
  /** Answers first; return undefined to fall through to the exchange. */
  override: ((path: string, init?: RequestInit) => Response | Promise<Response> | undefined) | null = null;
  private tradeSeq = 0;

  constructor(options: FakeApiOptions = {}) {
    this.balance = options.balance ?? 1000;
    this.isAdmin = options.isAdmin ?? false;
    for (const m of options.markets ?? []) this.add(m);
    for (const [slug, p] of Object.entries(options.positions ?? {})) {
      const m = this.markets.get(slug);
      if (m) this.positions.set(slug, { ...this.emptyPosition(m), ...p });
    }
    this.leaderboard = {
      entries: [],
      me: null,
      rankedTraders: 0,
      startingBalancePts: 1000,
      updatedAt: new Date().toISOString(),
      ...options.leaderboard,
    };
  }

  add(m: ApiMarket): void {
    this.markets.set(m.slug, m);
    this.history.set(m.slug, [
      { t: Date.parse(m.createdAt), p: 0.5 },
      { t: Date.now(), p: m.probYes },
    ]);
  }

  install(): this {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => this.respond(String(input), init)),
    );
    return this;
  }

  callsTo(method: string, pathPart: string): FakeCall[] {
    return this.calls.filter((c) => c.method === method && c.path.includes(pathPart));
  }

  private emptyPosition(m: ApiMarket): ApiPosition {
    return {
      marketId: m.id,
      marketSlug: m.slug,
      yesShares: 0,
      noShares: 0,
      yesCostPts: 0,
      noCostPts: 0,
      costBasisPts: 0,
      realizedPts: 0,
      claimed: false,
      valuePts: 0,
      payoutPts: null,
      settledAt: null,
    };
  }

  private view(m: ApiMarket): ApiMarket {
    const isCreator = m.creator === this.sessionAddress;
    const open = m.status === 'open';
    return {
      ...m,
      viewer: {
        isCreator,
        canTrade: m.tradable && !isCreator,
        canResolve: (open || m.status === 'closed') && (isCreator || this.isAdmin),
      },
    };
  }

  private positionOf(m: ApiMarket): ApiPosition | null {
    const p = this.positions.get(m.slug);
    if (!p) return null;
    const settled = p.settledAt !== null;
    return { ...p, valuePts: settled ? 0 : p.yesShares * m.probYes + p.noShares * (1 - m.probYes) };
  }

  async respond(url: string, init?: RequestInit): Promise<Response> {
    const u = new URL(url);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    this.calls.push({ method, path: u.pathname, query: u.searchParams, body });
    if (this.failNext) {
      const res = this.failNext;
      this.failNext = null;
      return res;
    }
    const path = u.pathname;
    const custom = this.override?.(path, init);
    if (custom) return custom;
    if (path === '/v1/me')
      return json({
        id: USER_ID,
        createdAt: ISO(Date.now() - DAY),
        wallets: [{ chain: 'solana', address: this.sessionAddress, linkedAt: ISO(Date.now() - DAY) }],
        avatar: this.avatar,
      });
    if (path === '/v1/me/avatar' && method === 'PUT') {
      const id = isRecord(body) ? body.mediaId : undefined;
      const image = typeof id === 'string' ? this.images.get(id) : undefined;
      if (typeof id === 'string' && !image) return failure(404, 'media_not_found', 'No such image');
      this.avatar = image ?? null;
      return json({ avatar: this.avatar });
    }
    const report = /^\/v1\/media\/([0-9a-f]{64})\/report$/.exec(path);
    if (report?.[1] && method === 'POST') {
      if (this.reportedImages.has(report[1])) return failure(409, 'media_already_reported', 'Already reported');
      this.reportedImages.add(report[1]);
      return json({ reported: true });
    }
    if (path === '/v1/auth/logout') return new Response(null, { status: 204 });
    if (path === '/v1/auth/session')
      return json({
        authenticated: true,
        userId: USER_ID,
        address: this.sessionAddress,
        expiresAt: ISO(Date.now() + DAY),
      });
    if (path === '/v1/me/portfolio') return json(this.portfolio());
    if (path === '/v1/leaderboard') return json(this.leaderboard);
    if (path === '/v1/markets' && method === 'GET') return json(this.list(u.searchParams));
    if (path === '/v1/markets' && method === 'POST') return this.create(body);
    const m = /^\/v1\/markets\/([^/]+)(?:\/(trades|resolve|candles))?$/.exec(path);
    if (m?.[1]) {
      const market = this.markets.get(decodeURIComponent(m[1]));
      if (!market) return failure(404, 'market_not_found', 'No market with this slug');
      if (!m[2] && method === 'GET') return json(this.detail(market));
      if (m[2] === 'trades' && method === 'POST') return this.trade(market, body);
      if (m[2] === 'resolve' && method === 'POST') return this.resolve(market, body);
      if (m[2] === 'candles' && method === 'GET') return json(this.candlesFor(market, u.searchParams));
    }
    return failure(404, 'not_found', `${method} ${path} not found`);
  }

  private list(q: URLSearchParams) {
    const status = q.get('status') ?? 'all';
    const sort = q.get('sort') ?? 'new';
    const limit = Number(q.get('limit') ?? 50);
    const offset = Number(q.get('offset') ?? 0);
    const tier = q.get('tier');
    const rows = [...this.markets.values()].filter((m) => {
      if (tier && m.tier !== tier) return false;
      switch (status) {
        case 'open':
          return m.status === 'open';
        case 'closed':
          return m.status === 'closed';
        case 'resolved':
          return m.status === 'resolved';
        case 'voided':
          return m.status === 'voided';
        case 'settled':
          return m.status === 'resolved' || m.status === 'voided';
        default:
          return true;
      }
    });
    const by: Record<string, (a: ApiMarket, b: ApiMarket) => number> = {
      closing: (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline),
      volume: (a, b) => b.volumePts - a.volumePts,
      traders: (a, b) => b.traders - a.traders,
      new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    };
    rows.sort(by[sort] ?? by.new ?? (() => 0));
    const page = rows.slice(offset, offset + limit).map((x) => this.view(x));
    return { markets: page, total: rows.length, nextOffset: offset + limit < rows.length ? offset + limit : null };
  }

  private candlesFor(m: ApiMarket, q: URLSearchParams): CandlesResponse {
    const tf = CandleTimeframe.parse(q.get('tf') ?? '5m');
    const side = q.get('side') === 'no' ? 'no' : 'yes';
    const step = CANDLE_TIMEFRAME_SECONDS[tf];
    const served = this.candles.get(m.slug);
    const now = Math.floor(Date.now() / 1000);
    const start = Math.floor(Date.parse(m.createdAt) / 1000 / step) * step;
    const points = this.history.get(m.slug) ?? [];
    const trades = this.trades.get(m.slug) ?? [];
    const priceAt = (seconds: number): number => {
      const hit = [...points].reverse().find((p) => p.t <= seconds * 1000);
      return hit?.p ?? points[0]?.p ?? m.probYes;
    };
    const flip = (p: number): number => (side === 'yes' ? p : 1 - p);
    let previous = flip(points[0]?.p ?? 0.5);
    const derived: Candle[] = [];
    for (let t = start; t <= now; t += step) {
      const inBucket = trades.filter((x) => Date.parse(x.at) / 1000 >= t && Date.parse(x.at) / 1000 < t + step);
      const bots = inBucket.filter((x) => x.bot === true);
      const close = flip(priceAt(Math.min(t + step - 1, now)));
      derived.push({
        t,
        o: previous,
        h: Math.max(previous, close),
        l: Math.min(previous, close),
        c: close,
        v: inBucket.reduce((a, x) => a + x.costPts, 0),
        vBot: bots.reduce((a, x) => a + x.costPts, 0),
        n: inBucket.length,
        nBot: bots.length,
      });
      previous = close;
    }
    const all = served ?? derived;
    const candles = all.slice(-Number(q.get('limit') ?? 300));
    return { tf, side, candles, from: candles[0]?.t ?? start, to: now };
  }

  private detail(m: ApiMarket): MarketDetailResponse {
    return {
      market: this.view(m),
      trades: this.trades.get(m.slug) ?? [],
      history: this.history.get(m.slug) ?? [],
      position: this.positionOf(m),
    };
  }

  private portfolio(): ApiPortfolio {
    const positions = [...this.positions.values()].flatMap((p) => {
      const m = this.markets.get(p.marketSlug);
      return m ? [{ p, m }] : [];
    });
    const open = positions.reduce((a, { p, m }) => a + (this.positionOf(m)?.valuePts ?? 0) * (p.settledAt ? 0 : 1), 0);
    const net = this.balance + open;
    return {
      balancePts: this.balance,
      startingBalancePts: 1000,
      openValuePts: open,
      netWorthPts: net,
      pnlPts: net - 1000,
      rank: positions.length > 0 ? 1 : null,
      positions: positions.flatMap(({ m }) => {
        const p = this.positionOf(m);
        return p ? [p] : [];
      }),
      markets: positions.map(({ m }) => this.view(m)),
      history: [...this.trades.values()].flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    };
  }

  private create(body: unknown): Response {
    const req = body as {
      source: TweetSnapshot;
      statement: string;
      criteria: string;
      deadline?: string;
      durationPreset?: DurationPresetId;
      project: { name: string; ticker: string; mint?: string };
      initialProbYes?: number;
    };
    for (const m of this.markets.values()) {
      if (m.source?.id === req.source.id)
        return failure(409, 'duplicate_tweet', 'A market already exists for this tweet', { existingSlug: m.slug });
    }
    const created = makeMarket({
      prob: req.initialProbYes ?? 0.5,
      statement: req.statement,
      criteria: req.criteria,
      deadline: req.durationPreset
        ? ISO(Date.now() + durationPresetOf(req.durationPreset).ms)
        : (req.deadline ?? ISO(Date.now() + DAY)),
      durationPreset: req.durationPreset ?? null,
      creator: this.sessionAddress,
      source: req.source,
      project: {
        slug: req.project.name.toLowerCase().replace(/\W+/g, '-'),
        name: req.project.name,
        ticker: req.project.ticker,
      },
      slug: req.statement.toLowerCase().replace(/\W+/g, '-').slice(0, 60).replace(/-$/, ''),
    });
    this.add(created);
    return json({ market: this.view(created) }, 201);
  }

  private trade(market: ApiMarket, body: unknown): Response {
    const req = body as
      | { action: 'buy'; side: MarketSide; amountPts: number; minShares?: number }
      | { action: 'sell'; side: MarketSide; shares: number; minProceedsPts?: number };
    if (market.creator === this.sessionAddress)
      return failure(403, 'creator_cannot_trade', 'You created this market, so you cannot trade on it');
    if (!market.tradable || market.status !== 'open' || Date.now() >= Date.parse(market.deadline))
      return failure(409, 'market_closed', 'Trading closed at the deadline');
    const inv = { yes: market.qYes, no: market.qNo };
    const pos = this.positions.get(market.slug) ?? this.emptyPosition(market);
    const side = req.side;
    let shares: number;
    let costPts: number;
    let next = pos;
    if (req.action === 'buy') {
      if (req.amountPts > this.balance)
        return failure(422, 'insufficient_balance', 'Not enough practice points for this trade', {
          balancePts: String(this.balance),
        });
      shares = quote(inv, side, req.amountPts, market.liquidityB).shares;
      if (req.minShares !== undefined && shares < req.minShares)
        return failure(422, 'slippage_exceeded', 'The price moved', { shares: String(shares) });
      costPts = req.amountPts;
      this.balance -= costPts;
      next = {
        ...pos,
        ...(side === 'yes'
          ? { yesShares: pos.yesShares + shares, yesCostPts: pos.yesCostPts + costPts }
          : { noShares: pos.noShares + shares, noCostPts: pos.noCostPts + costPts }),
      };
    } else {
      const owned = side === 'yes' ? pos.yesShares : pos.noShares;
      if (req.shares > owned * (1 + 1e-9) + 1e-9)
        return failure(422, 'insufficient_shares', 'You do not hold that many shares', { heldShares: String(owned) });
      shares = Math.min(req.shares, owned);
      costPts = proceedsForShares(inv, side, shares, market.liquidityB);
      if (req.minProceedsPts !== undefined && costPts < req.minProceedsPts)
        return failure(422, 'slippage_exceeded', 'The price moved', { proceedsPts: String(costPts) });
      this.balance += costPts;
      const cost = side === 'yes' ? pos.yesCostPts : pos.noCostPts;
      const removed = owned > 0 ? (cost * shares) / owned : 0;
      next = {
        ...pos,
        ...(side === 'yes'
          ? { yesShares: owned - shares, yesCostPts: cost - removed }
          : { noShares: owned - shares, noCostPts: cost - removed }),
        realizedPts: pos.realizedPts + costPts - removed,
      };
    }
    next = { ...next, costBasisPts: next.yesCostPts + next.noCostPts };
    this.positions.set(market.slug, next);
    const after = withShares(inv, side, req.action === 'buy' ? shares : -shares);
    const updated: ApiMarket = {
      ...market,
      qYes: after.yes,
      qNo: after.no,
      probYes: lmsrPriceYes(after, market.liquidityB),
      volumePts: market.volumePts + costPts,
      tradeCount: market.tradeCount + 1,
      traders: market.traders + (pos.yesShares + pos.noShares + pos.realizedPts === 0 ? 1 : 0),
    };
    this.markets.set(market.slug, updated);
    this.tradeSeq += 1;
    const trade: ApiTrade = {
      id: `trade-${this.tradeSeq}`,
      marketId: market.id,
      marketSlug: market.slug,
      action: req.action,
      side,
      shares,
      costPts,
      priceBefore: market.probYes,
      priceAfter: updated.probYes,
      by: this.sessionAddress,
      at: new Date().toISOString(),
    };
    this.trades.set(market.slug, [trade, ...(this.trades.get(market.slug) ?? [])]);
    this.history.set(market.slug, [...(this.history.get(market.slug) ?? []), { t: Date.now(), p: updated.probYes }]);
    return json({
      trade,
      market: this.view(updated),
      position: this.positionOf(updated) ?? next,
      balancePts: this.balance,
    });
  }

  private resolve(market: ApiMarket, body: unknown): Response {
    const req = body as { outcome: ProposedOutcome; note?: string };
    const creator = market.creator === this.sessionAddress;
    if (!creator && !this.isAdmin) return failure(403, 'forbidden', 'Only the creator or an admin can resolve it');
    if (!this.isAdmin && req.outcome === 'no' && Date.now() < Date.parse(market.deadline))
      return failure(409, 'resolve_too_early', 'NO can be decided only after the deadline');
    if (market.status === 'resolved' || market.status === 'voided') {
      const same = market.resolution?.finalOutcome === req.outcome;
      if (!same) return failure(409, 'market_already_resolved', 'This market was already resolved');
      return json({
        market: this.view(market),
        settlement: {
          outcome: req.outcome,
          method: 'creator',
          positions: 0,
          payoutPts: 0,
          resolvedAt: ISO(Date.now()),
        },
        alreadyResolved: true,
      });
    }
    const at = ISO(Date.now());
    const pos = this.positions.get(market.slug);
    let paid = 0;
    if (pos) {
      paid = req.outcome === 'void' ? pos.costBasisPts : req.outcome === 'yes' ? pos.yesShares : pos.noShares;
      this.balance += paid;
      this.positions.set(market.slug, {
        ...pos,
        yesCostPts: 0,
        noCostPts: 0,
        costBasisPts: 0,
        realizedPts: pos.realizedPts + paid - pos.costBasisPts,
        claimed: true,
        payoutPts: paid,
        settledAt: at,
      });
    }
    const resolved: ApiMarket = {
      ...market,
      status: req.outcome === 'void' ? 'voided' : 'resolved',
      tradable: false,
      resolution: {
        method: creator ? 'creator' : 'admin',
        proposedOutcome: req.outcome,
        evidence: req.note ? [{ kind: 'note', text: req.note }] : [],
        proposedAt: at,
        disputeEndsAt: at,
        disputes: [],
        finalOutcome: req.outcome,
        resolvedAt: at,
      },
    };
    this.markets.set(market.slug, resolved);
    return json({
      market: this.view(resolved),
      settlement: {
        outcome: req.outcome,
        method: creator ? 'creator' : 'admin',
        positions: pos ? 1 : 0,
        payoutPts: paid,
        resolvedAt: at,
      },
      alreadyResolved: false,
    });
  }
}
