import { bucketTrades } from './candles.ts';
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
  TradeRecord,
} from './types.ts';

interface State {
  users: Set<string>;
  bots: Set<string>;
  botStates: Map<string, BotState>;
  markets: Map<string, MarketRecord>;
  accounts: Map<string, AccountRecord>;
  positions: Map<string, PositionRecord>;
  trades: TradeRecord[];
  resolutions: Map<string, ResolutionRecord>;
  tradeSeq: number;
}

const posKey = (userId: string, marketId: string) => `${userId}:${marketId}`;

/**
 * In-memory MarketRepository for tests and local dev. Transactions run one at a time and roll back on a throw
 * (the state is cloned before and restored after a failure), which is what the Postgres row locks give per market.
 */
export class MemoryMarketRepository implements MarketRepository {
  private state: State = {
    users: new Set(),
    bots: new Set(),
    botStates: new Map(),
    markets: new Map(),
    accounts: new Map(),
    positions: new Map(),
    trades: [],
    resolutions: new Map(),
    tradeSeq: 0,
  };
  private queue: Promise<unknown> = Promise.resolve();

  get resolutions(): ReadonlyMap<string, ResolutionRecord> {
    return this.state.resolutions;
  }

  transaction<T>(fn: (tx: MarketTx) => Promise<T>): Promise<T> {
    const run = async () => {
      const snapshot = structuredClone(this.state);
      try {
        return await fn(this.tx());
      } catch (err) {
        this.state = snapshot;
        throw err;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private tx(): MarketTx {
    const s = () => this.state;
    return {
      lockMarket: async (slug) => this.findBySlug(slug),
      lockAccount: async (userId, now) => this.ensure(userId, now),
      lockAccounts: async (userIds) => {
        const out = new Map<string, AccountRecord>();
        for (const id of [...userIds].sort()) {
          const a = s().accounts.get(id);
          if (a) out.set(id, { ...a });
        }
        return out;
      },
      position: async (userId, marketId) => this.pos(userId, marketId),
      unsettledPositions: async (marketId) =>
        [...s().positions.values()]
          .filter((p) => p.marketId === marketId && p.settledAt === null)
          .sort((a, b) => (a.userId < b.userId ? -1 : 1))
          .map((p) => ({ ...p })),
      savePosition: async (p) => void s().positions.set(posKey(p.userId, p.marketId), { ...p }),
      saveAccount: async (a) => void s().accounts.set(a.userId, { ...a }),
      saveMarket: async (m) => {
        const stored = s().markets.get(m.id);
        s().markets.set(m.id, { ...m, imageId: stored ? stored.imageId : m.imageId });
      },
      insertTrade: async (t: NewTrade) => {
        s().tradeSeq += 1;
        const row: TradeRecord = { ...t, id: String(s().tradeSeq) };
        s().trades.push(row);
        return { ...row };
      },
      insertResolution: async (r) => {
        if (s().resolutions.has(r.marketId)) throw new Error('duplicate resolution');
        s().resolutions.set(r.marketId, { ...r });
      },
      resolution: async (marketId) => {
        const r = s().resolutions.get(marketId);
        return r ? { ...r } : null;
      },
      botState: async (marketId) => {
        const b = s().botStates.get(marketId);
        return b ? { ...b } : null;
      },
      saveBotState: async (b) => void s().botStates.set(b.marketId, { ...b }),
    };
  }

  private findBySlug(slug: string): MarketRecord | null {
    for (const m of this.state.markets.values()) if (m.slug === slug) return { ...m };
    return null;
  }

  private pos(userId: string, marketId: string): PositionRecord | null {
    const p = this.state.positions.get(posKey(userId, marketId));
    return p ? { ...p } : null;
  }

  private ensure(userId: string, now: Date): AccountRecord {
    let a = this.state.accounts.get(userId);
    if (!a) {
      a = { userId, balanceMicro: STARTING_BALANCE_MICRO, createdAt: now };
      this.state.accounts.set(userId, a);
    }
    return { ...a };
  }

  async insertMarket(m: MarketRecord): Promise<InsertMarketResult> {
    const all = [...this.state.markets.values()];
    if (m.sourceTweetId !== null && all.some((x) => x.sourceTweetId === m.sourceTweetId)) return 'duplicate_tweet';
    if (all.some((x) => x.slug === m.slug)) return 'slug_taken';
    this.state.markets.set(m.id, { ...m });
    return 'ok';
  }

  async ensureUser(userId: string) {
    this.state.users.add(userId);
  }

  async ensureBotUser(userId: string) {
    this.state.users.add(userId);
    this.state.bots.add(userId);
  }

  async marketBySlug(slug: string) {
    return this.findBySlug(slug);
  }

  async marketBySourceTweet(tweetId: string) {
    for (const m of this.state.markets.values()) if (m.sourceTweetId === tweetId) return { ...m };
    return null;
  }

  async marketsByIds(ids: readonly string[]) {
    return ids.flatMap((id) => {
      const m = this.state.markets.get(id);
      return m ? [{ ...m }] : [];
    });
  }

  async listMarkets(f: ListFilter) {
    const now = f.now.getTime();
    const keep = (m: MarketRecord): boolean => {
      if (f.tier && m.tier !== f.tier) return false;
      const open = m.status === 'open';
      switch (f.status) {
        case 'all':
          return true;
        case 'open':
          return open && m.closesAt.getTime() > now;
        case 'closed':
          return open && m.closesAt.getTime() <= now;
        case 'resolved':
          return m.status === 'resolved';
        case 'voided':
          return m.status === 'voided';
        case 'settled':
          return !open;
      }
    };
    const byNew = (a: MarketRecord, b: MarketRecord) =>
      b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
    const order: Record<ListFilter['sort'], (a: MarketRecord, b: MarketRecord) => number> = {
      new: byNew,
      volume: (a, b) => b.volumeMicro - a.volumeMicro || byNew(a, b),
      traders: (a, b) => b.traders - a.traders || byNew(a, b),
      closing: (a, b) => a.closesAt.getTime() - b.closesAt.getTime() || byNew(a, b),
    };
    const rows = [...this.state.markets.values()].filter(keep).sort(order[f.sort]);
    return { markets: rows.slice(f.offset, f.offset + f.limit).map((m) => ({ ...m })), total: rows.length };
  }

  async recentTrades(marketId: string, limit: number) {
    return this.state.trades
      .filter((t) => t.marketId === marketId)
      .slice(-limit)
      .reverse()
      .map((t) => ({ ...t }));
  }

  async pricePoints(marketId: string, limit: number) {
    return this.state.trades
      .filter((t) => t.marketId === marketId)
      .slice(-limit)
      .map((t) => ({ at: t.createdAt, p: t.priceAfter }));
  }

  async tradeBuckets(marketId: string, range: BucketRange) {
    return bucketTrades(
      this.state.trades.filter((t) => t.marketId === marketId),
      range,
    );
  }

  async pricesAt(marketIds: readonly string[], at: Date) {
    const wanted = new Set(marketIds);
    const out = new Map<string, number>();
    for (const t of this.state.trades)
      if (wanted.has(t.marketId) && t.createdAt.getTime() <= at.getTime()) out.set(t.marketId, t.priceAfter);
    return out;
  }

  async userTrades(userId: string, limit: number) {
    return this.state.trades
      .filter((t) => t.userId === userId)
      .slice(-limit)
      .reverse()
      .map((t) => ({ ...t }));
  }

  async userPositions(userId: string) {
    return [...this.state.positions.values()]
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((p) => ({ ...p }));
  }

  async position(userId: string, marketId: string) {
    return this.pos(userId, marketId);
  }

  async ensureAccount(userId: string, now: Date) {
    return this.ensure(userId, now);
  }

  async account(userId: string) {
    const a = this.state.accounts.get(userId);
    return a ? { ...a } : null;
  }

  private allRows(): LeaderRow[] {
    const humans = [...this.state.accounts.values()].filter((a) => !this.state.bots.has(a.userId));
    const rows = humans.map((a) => {
      const held = [...this.state.positions.values()].filter((p) => p.userId === a.userId);
      let openValuePts = 0;
      for (const p of held) {
        const m = this.state.markets.get(p.marketId);
        if (m && p.settledAt === null) openValuePts += p.yesShares * m.probYes + p.noShares * (1 - m.probYes);
      }
      return {
        userId: a.userId,
        address: this.state.trades.find((t) => t.userId === a.userId)?.walletAddress ?? null,
        balanceMicro: a.balanceMicro,
        openValuePts,
        marketsTraded: held.length,
        rank: null as number | null,
        createdAt: a.createdAt.getTime(),
      };
    });
    const worth = (r: LeaderRow) => r.balanceMicro / 1_000_000 + r.openValuePts;
    const ranked = rows.filter((r) => r.marketsTraded > 0 && r.address !== null);
    for (const r of ranked) r.rank = ranked.filter((o) => worth(o) > worth(r)).length + 1;
    return rows
      .sort(
        (a, b) =>
          (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt,
      )
      .map(({ createdAt: _createdAt, ...row }) => row);
  }

  async leaderboard(limit: number) {
    const ranked = this.allRows().filter((r) => r.rank !== null);
    return { rows: ranked.slice(0, limit), ranked: ranked.length };
  }

  async leaderRow(userId: string) {
    return this.allRows().find((r) => r.userId === userId) ?? null;
  }

  async marketsByImage(imageId: string) {
    return [...this.state.markets.values()].filter((m) => m.imageId === imageId).map((m) => ({ ...m }));
  }

  async detachImage(imageId: string) {
    let n = 0;
    for (const m of this.state.markets.values()) {
      if (m.imageId !== imageId) continue;
      m.imageId = null;
      n += 1;
    }
    return n;
  }
}
