import type { DurationPresetId, MarketSide, MarketTier, ProposedOutcome, TradeAction } from '@windle/shared';
import { and, asc, desc, eq, gt, inArray, lt, lte, ne, type SQL, sql } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import type { Db } from '../store/postgres.ts';
import { STARTING_BALANCE_MICRO } from './engine.ts';
import type {
  AccountRecord,
  BotState,
  BucketRange,
  InsertMarketResult,
  LeaderRow,
  ListFilter,
  MarketRecord,
  MarketRepository,
  MarketTx,
  NewTrade,
  PositionRecord,
  ResolutionRecord,
  ResolverRole,
  StoredStatus,
  TradeBucket,
  TradeRecord,
} from './types.ts';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type MarketRow = typeof schema.markets.$inferSelect;
type TradeRow = typeof schema.trades.$inferSelect;
type PositionRow = typeof schema.positions.$inferSelect;
type AccountRow = typeof schema.accounts.$inferSelect;

const m = schema.markets;
const t = schema.trades;
const p = schema.positions;
const a = schema.accounts;
const bs = schema.marketBotState;

function toMarket(r: MarketRow): MarketRecord {
  return {
    id: r.id,
    slug: r.slug,
    tier: r.tier as MarketTier,
    status: r.status as StoredStatus,
    project: r.project,
    statement: r.statement,
    criteria: r.criteria,
    closesAt: r.closesAt,
    createdAt: r.createdAt,
    durationPreset: r.durationPreset as DurationPresetId | null,
    creatorId: r.creatorId,
    creatorAddress: r.creatorAddress,
    sourceTweetId: r.sourceTweetId,
    source: r.source,
    collateral: r.collateral,
    liquidityB: r.liquidityB,
    qYes: r.qYes,
    qNo: r.qNo,
    probYes: r.probYes,
    openProbYes: r.openProbYes,
    volumeMicro: r.volumeMicro,
    traders: r.traders,
    tradeCount: r.tradeCount,
    buyCount: r.buyCount,
    botVolumeMicro: r.botVolumeMicro,
    botTradeCount: r.botTradeCount,
    outcome: r.outcome as ProposedOutcome | null,
    resolvedAt: r.resolvedAt,
    resolvedBy: r.resolvedBy,
    resolutionMethod: r.resolutionMethod as ResolverRole | null,
    resolutionNote: r.resolutionNote,
    imageId: r.imageId,
  };
}

function marketValues(r: MarketRecord, now: Date) {
  return {
    id: r.id,
    slug: r.slug,
    tier: r.tier,
    status: r.status,
    project: r.project,
    statement: r.statement,
    criteria: r.criteria,
    closesAt: r.closesAt,
    createdAt: r.createdAt,
    durationPreset: r.durationPreset,
    creatorId: r.creatorId,
    creatorAddress: r.creatorAddress,
    sourceTweetId: r.sourceTweetId,
    source: r.source,
    collateral: r.collateral,
    liquidityB: r.liquidityB,
    qYes: r.qYes,
    qNo: r.qNo,
    probYes: r.probYes,
    openProbYes: r.openProbYes,
    volumeMicro: r.volumeMicro,
    traders: r.traders,
    tradeCount: r.tradeCount,
    buyCount: r.buyCount,
    botVolumeMicro: r.botVolumeMicro,
    botTradeCount: r.botTradeCount,
    outcome: r.outcome,
    resolvedAt: r.resolvedAt,
    resolvedBy: r.resolvedBy,
    resolutionMethod: r.resolutionMethod,
    resolutionNote: r.resolutionNote,
    imageId: r.imageId,
    updatedAt: now,
  };
}

const toTrade = (r: TradeRow, slug: string): TradeRecord => ({
  id: String(r.id),
  marketId: r.marketId,
  marketSlug: slug,
  userId: r.userId,
  walletAddress: r.walletAddress,
  action: r.action as TradeAction,
  side: r.side as MarketSide,
  shares: r.shares,
  costMicro: r.costMicro,
  priceBefore: r.priceBefore,
  priceAfter: r.priceAfter,
  bot: r.bot,
  createdAt: r.createdAt,
});

const toPosition = (r: PositionRow): PositionRecord => ({ ...r });
const toAccount = (r: AccountRow): AccountRecord => ({
  userId: r.userId,
  balanceMicro: r.balanceMicro,
  createdAt: r.createdAt,
});

class PgMarketTx implements MarketTx {
  private readonly tx: Tx;

  constructor(tx: Tx) {
    this.tx = tx;
  }

  async lockMarket(slug: string) {
    const [row] = await this.tx.select().from(m).where(eq(m.slug, slug)).for('update');
    return row ? toMarket(row) : null;
  }

  async lockAccount(userId: string, now: Date) {
    await this.tx
      .insert(a)
      .values({ userId, balanceMicro: STARTING_BALANCE_MICRO, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    const [row] = await this.tx.select().from(a).where(eq(a.userId, userId)).for('update');
    if (!row) throw new Error(`account ${userId} vanished inside its transaction`);
    return toAccount(row);
  }

  async lockAccounts(userIds: readonly string[]) {
    const out = new Map<string, AccountRecord>();
    if (userIds.length === 0) return out;
    const rows = await this.tx
      .select()
      .from(a)
      .where(inArray(a.userId, [...userIds]))
      .orderBy(asc(a.userId))
      .for('update');
    for (const row of rows) out.set(row.userId, toAccount(row));
    return out;
  }

  async position(userId: string, marketId: string) {
    const [row] = await this.tx
      .select()
      .from(p)
      .where(and(eq(p.userId, userId), eq(p.marketId, marketId)));
    return row ? toPosition(row) : null;
  }

  async unsettledPositions(marketId: string) {
    const rows = await this.tx
      .select()
      .from(p)
      .where(and(eq(p.marketId, marketId), sql`${p.settledAt} is null`))
      .orderBy(asc(p.userId));
    return rows.map(toPosition);
  }

  async savePosition(pos: PositionRecord) {
    const { userId, marketId, createdAt, ...rest } = pos;
    await this.tx
      .insert(p)
      .values(pos)
      .onConflictDoUpdate({ target: [p.userId, p.marketId], set: rest });
  }

  async saveAccount(account: AccountRecord, now: Date) {
    await this.tx
      .update(a)
      .set({ balanceMicro: account.balanceMicro, updatedAt: now })
      .where(eq(a.userId, account.userId));
  }

  async saveMarket(market: MarketRecord, now: Date) {
    const { id, imageId: _image, ...values } = marketValues(market, now);
    await this.tx.update(m).set(values).where(eq(m.id, id));
  }

  async insertTrade(trade: NewTrade) {
    const { marketSlug, ...values } = trade;
    const [row] = await this.tx.insert(t).values(values).returning();
    if (!row) throw new Error('trade insert returned nothing');
    return toTrade(row, marketSlug);
  }

  async insertResolution(r: ResolutionRecord) {
    await this.tx.insert(schema.marketResolutions).values(r);
  }

  async resolution(marketId: string): Promise<ResolutionRecord | null> {
    const [row] = await this.tx
      .select()
      .from(schema.marketResolutions)
      .where(eq(schema.marketResolutions.marketId, marketId));
    if (!row) return null;
    return {
      ...row,
      outcome: row.outcome as ProposedOutcome,
      method: row.method as ResolverRole,
      resolvedBy: row.resolvedBy ?? '',
    };
  }

  async botState(marketId: string): Promise<BotState | null> {
    const [row] = await this.tx.select().from(bs).where(eq(bs.marketId, marketId));
    return row ? { ...row } : null;
  }

  async saveBotState(state: BotState) {
    const { marketId, ...rest } = state;
    await this.tx.insert(bs).values(state).onConflictDoUpdate({ target: bs.marketId, set: rest });
  }
}

/**
 * Net worth inputs per human account (house bots are left out); positions of settled markets count 0 (their payout
 * is already in the balance).
 */
const NET_WORTH = sql`
  select a.user_id, a.balance_micro, a.created_at,
    coalesce(sum(case when p.settled_at is null
      then p.yes_shares * mk.prob_yes + p.no_shares * (1 - mk.prob_yes) else 0 end), 0)::float8 as open_value,
    count(p.market_id)::int as markets_traded,
    (select w.address from wallets w where w.user_id = a.user_id order by w.first_seen limit 1) as address
  from accounts a
  join users u on u.id = a.user_id and not u.is_bot
  left join positions p on p.user_id = a.user_id
  left join markets mk on mk.id = p.market_id
  group by a.user_id`;

interface BucketSqlRow extends Record<string, unknown> {
  t: number | string;
  h: number;
  l: number;
  c: number;
  v: number | string;
  v_bot: number | string;
  n: number;
  n_bot: number;
}

const iso = (sec: number) => new Date(sec * 1000).toISOString();

interface LeaderSqlRow extends Record<string, unknown> {
  user_id: string;
  balance_micro: string | number;
  open_value: number;
  markets_traded: number;
  address: string | null;
  rank: string | number | null;
}

const toLeader = (r: LeaderSqlRow): LeaderRow => ({
  userId: r.user_id,
  address: r.address,
  balanceMicro: Number(r.balance_micro),
  openValuePts: Number(r.open_value),
  marketsTraded: Number(r.markets_traded),
  rank: r.rank === null ? null : Number(r.rank),
});

export class PostgresMarketRepository implements MarketRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  transaction<T>(fn: (tx: MarketTx) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new PgMarketTx(tx)));
  }

  async insertMarket(market: MarketRecord): Promise<InsertMarketResult> {
    if (market.sourceTweetId !== null && (await this.marketBySourceTweet(market.sourceTweetId)))
      return 'duplicate_tweet';
    const inserted = await this.db
      .insert(m)
      .values(marketValues(market, market.createdAt))
      .onConflictDoNothing()
      .returning({ id: m.id });
    if (inserted.length > 0) return 'ok';
    // Lost a race on one of the two unique keys: report which.
    if (market.sourceTweetId !== null && (await this.marketBySourceTweet(market.sourceTweetId)))
      return 'duplicate_tweet';
    return 'slug_taken';
  }

  async ensureUser(userId: string, now: Date) {
    await this.db.insert(schema.users).values({ id: userId, createdAt: now }).onConflictDoNothing();
  }

  async ensureBotUser(userId: string, now: Date) {
    await this.db
      .insert(schema.users)
      .values({ id: userId, createdAt: now, isBot: true })
      .onConflictDoUpdate({ target: schema.users.id, set: { isBot: true } });
  }

  async marketBySlug(slug: string) {
    const [row] = await this.db.select().from(m).where(eq(m.slug, slug));
    return row ? toMarket(row) : null;
  }

  async marketBySourceTweet(tweetId: string) {
    const [row] = await this.db.select().from(m).where(eq(m.sourceTweetId, tweetId));
    return row ? toMarket(row) : null;
  }

  async marketsByIds(ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(m)
      .where(inArray(m.id, [...ids]));
    return rows.map(toMarket);
  }

  async listMarkets(f: ListFilter) {
    const where: SQL[] = [];
    if (f.tier) where.push(eq(m.tier, f.tier));
    switch (f.status) {
      case 'open':
        where.push(eq(m.status, 'open'), gt(m.closesAt, f.now));
        break;
      case 'closed':
        where.push(eq(m.status, 'open'), lte(m.closesAt, f.now));
        break;
      case 'resolved':
      case 'voided':
        where.push(eq(m.status, f.status));
        break;
      case 'settled':
        where.push(ne(m.status, 'open'));
        break;
      case 'all':
        break;
    }
    const cond = where.length > 0 ? and(...where) : undefined;
    const order = {
      new: [desc(m.createdAt), desc(m.id)],
      volume: [desc(m.volumeMicro), desc(m.createdAt)],
      traders: [desc(m.traders), desc(m.createdAt)],
      closing: [asc(m.closesAt), desc(m.createdAt)],
    }[f.sort];
    const [rows, [count]] = await Promise.all([
      this.db
        .select()
        .from(m)
        .where(cond)
        .orderBy(...order)
        .limit(f.limit)
        .offset(f.offset),
      this.db.select({ n: sql<number>`count(*)::int` }).from(m).where(cond),
    ]);
    return { markets: rows.map(toMarket), total: count?.n ?? 0 };
  }

  private async slugsOf(rows: readonly TradeRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.marketId))];
    if (ids.length === 0) return new Map();
    const found = await this.db.select({ id: m.id, slug: m.slug }).from(m).where(inArray(m.id, ids));
    return new Map(found.map((r) => [r.id, r.slug]));
  }

  async recentTrades(marketId: string, limit: number) {
    const rows = await this.db.select().from(t).where(eq(t.marketId, marketId)).orderBy(desc(t.id)).limit(limit);
    const slugs = await this.slugsOf(rows);
    return rows.map((r) => toTrade(r, slugs.get(r.marketId) ?? ''));
  }

  async pricePoints(marketId: string, limit: number) {
    const rows = await this.db
      .select({ at: t.createdAt, p: t.priceAfter })
      .from(t)
      .where(eq(t.marketId, marketId))
      .orderBy(desc(t.id))
      .limit(limit);
    return rows.reverse();
  }

  async tradeBuckets(marketId: string, range: BucketRange) {
    const step = sql.raw(String(Math.trunc(range.stepSec)));
    const [prior, rows] = await Promise.all([
      this.db
        .select({ p: t.priceAfter })
        .from(t)
        .where(and(eq(t.marketId, marketId), lt(t.createdAt, new Date(range.fromSec * 1000))))
        .orderBy(desc(t.id))
        .limit(1),
      this.db.execute<BucketSqlRow>(sql`
        select (floor(extract(epoch from created_at) / ${step}) * ${step})::float8 as t,
          max(price_after) as h,
          min(price_after) as l,
          (array_agg(price_after order by id desc))[1] as c,
          sum(cost_micro)::float8 as v,
          coalesce(sum(cost_micro) filter (where bot), 0)::float8 as v_bot,
          count(*)::int as n,
          (count(*) filter (where bot))::int as n_bot
        from trades
        where market_id = ${marketId}
          and created_at >= ${iso(range.fromSec)}::timestamptz
          and created_at < ${iso(range.toSec)}::timestamptz
        group by 1
        order by 1`),
    ]);
    const buckets: TradeBucket[] = [...rows].map((r) => ({
      t: Number(r.t),
      h: Number(r.h),
      l: Number(r.l),
      c: Number(r.c),
      volumeMicro: Number(r.v),
      botVolumeMicro: Number(r.v_bot),
      n: Number(r.n),
      nBot: Number(r.n_bot),
    }));
    return { before: prior[0]?.p ?? null, buckets };
  }

  async pricesAt(marketIds: readonly string[], at: Date) {
    const out = new Map<string, number>();
    if (marketIds.length === 0) return out;
    const rows = await this.db
      .select({
        id: m.id,
        p: sql<number | null>`(
          select tr.price_after from trades tr
          where tr.market_id = "markets"."id" and tr.created_at <= ${at.toISOString()}::timestamptz
          order by tr.created_at desc, tr.id desc limit 1)`,
      })
      .from(m)
      .where(inArray(m.id, [...marketIds]));
    for (const r of rows) if (r.p !== null) out.set(r.id, Number(r.p));
    return out;
  }

  async userTrades(userId: string, limit: number) {
    const rows = await this.db.select().from(t).where(eq(t.userId, userId)).orderBy(desc(t.id)).limit(limit);
    const slugs = await this.slugsOf(rows);
    return rows.map((r) => toTrade(r, slugs.get(r.marketId) ?? ''));
  }

  async userPositions(userId: string) {
    const rows = await this.db.select().from(p).where(eq(p.userId, userId)).orderBy(desc(p.updatedAt));
    return rows.map(toPosition);
  }

  async position(userId: string, marketId: string) {
    const [row] = await this.db
      .select()
      .from(p)
      .where(and(eq(p.userId, userId), eq(p.marketId, marketId)));
    return row ? toPosition(row) : null;
  }

  async ensureAccount(userId: string, now: Date) {
    await this.db
      .insert(a)
      .values({ userId, balanceMicro: STARTING_BALANCE_MICRO, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    const account = await this.account(userId);
    if (!account) throw new Error(`account ${userId} was not created`);
    return account;
  }

  async account(userId: string) {
    const [row] = await this.db.select().from(a).where(eq(a.userId, userId));
    return row ? toAccount(row) : null;
  }

  async leaderboard(limit: number) {
    const rows = await this.db.execute<LeaderSqlRow>(sql`
      with nw as (${NET_WORTH}),
      ranked as (
        select nw.*, rank() over (order by nw.balance_micro::float8 / 1000000 + nw.open_value desc) as rank
        from nw where nw.markets_traded > 0 and nw.address is not null
      )
      select ranked.*, (select count(*) from ranked)::int as total
      from ranked order by rank, created_at limit ${limit}`);
    const list = [...rows];
    const total = list[0] ? Number((list[0] as LeaderSqlRow & { total: number }).total) : 0;
    return { rows: list.map(toLeader), ranked: total };
  }

  async leaderRow(userId: string) {
    const rows = await this.db.execute<LeaderSqlRow>(sql`
      with nw as (${NET_WORTH})
      select me.*,
        case when me.markets_traded > 0 and me.address is not null then 1 + (
          select count(*) from nw o
          where o.markets_traded > 0 and o.address is not null
            and o.balance_micro::float8 / 1000000 + o.open_value > me.balance_micro::float8 / 1000000 + me.open_value
        ) end as rank
      from nw me where me.user_id = ${userId}`);
    const [row] = [...rows];
    return row ? toLeader(row) : null;
  }

  async marketsByImage(imageId: string) {
    const rows = await this.db.select().from(m).where(eq(m.imageId, imageId));
    return rows.map(toMarket);
  }

  async detachImage(imageId: string) {
    const rows = await this.db.update(m).set({ imageId: null }).where(eq(m.imageId, imageId)).returning({ id: m.id });
    return rows.length;
  }
}
