import type {
  Collateral,
  DurationPresetId,
  MarketSide,
  MarketTier,
  ProjectRef,
  ProposedOutcome,
  TradeAction,
  TweetSnapshot,
} from '@windle/shared';

/** Stored status. "closed" is never stored: it is `open` with `closesAt` in the past. */
export type StoredStatus = 'open' | 'resolved' | 'voided';
export type ResolverRole = 'creator' | 'admin';

export interface MarketRecord {
  id: string;
  slug: string;
  tier: MarketTier;
  status: StoredStatus;
  project: ProjectRef;
  statement: string;
  criteria: string;
  closesAt: Date;
  createdAt: Date;
  /** The create-wizard preset that set `closesAt`; null for a custom deadline. */
  durationPreset: DurationPresetId | null;
  creatorId: string;
  creatorAddress: string;
  sourceTweetId: string | null;
  source: TweetSnapshot | null;
  collateral: Collateral | null;
  liquidityB: number;
  qYes: number;
  qNo: number;
  probYes: number;
  openProbYes: number;
  volumeMicro: number;
  /** Distinct human traders: house bots are not counted. */
  traders: number;
  tradeCount: number;
  /** Buy trades among `tradeCount` (bots included); the rest are sells. */
  buyCount: number;
  /** The house bots' part of `volumeMicro` / `tradeCount`. */
  botVolumeMicro: number;
  botTradeCount: number;
  outcome: ProposedOutcome | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionMethod: ResolverRole | null;
  resolutionNote: string | null;
  /** Media id of the market image (media table); shown only while that image is active. */
  imageId: string | null;
}

export interface AccountRecord {
  userId: string;
  balanceMicro: number;
  createdAt: Date;
}

export interface PositionRecord {
  userId: string;
  marketId: string;
  yesShares: number;
  noShares: number;
  yesCostMicro: number;
  noCostMicro: number;
  realizedMicro: number;
  payoutMicro: number | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeRecord {
  id: string;
  marketId: string;
  marketSlug: string;
  userId: string;
  walletAddress: string;
  action: TradeAction;
  side: MarketSide;
  shares: number;
  costMicro: number;
  priceBefore: number;
  priceAfter: number;
  /** Placed by a house market bot. */
  bot: boolean;
  createdAt: Date;
}

export type NewTrade = Omit<TradeRecord, 'id'>;

export interface ResolutionRecord {
  marketId: string;
  outcome: ProposedOutcome;
  method: ResolverRole;
  resolvedBy: string;
  walletAddress: string;
  note: string | null;
  positions: number;
  payoutMicro: number;
  createdAt: Date;
}

export interface LeaderRow {
  userId: string;
  address: string | null;
  balanceMicro: number;
  /** Held shares of unsettled markets at current prices, in points. */
  openValuePts: number;
  marketsTraded: number;
  /** Rank among accounts with at least one position; null for an account that never traded. */
  rank: number | null;
}

/** House-bot model state of one market, in log-odds (see bots/model.ts). */
export interface BotState {
  marketId: string;
  x: number;
  mu: number;
  humanX: number;
  steppedAt: Date;
}

/** Trades of one candle bucket, before gap filling. Prices are YES probabilities after each trade. */
export interface TradeBucket {
  /** Bucket start, Unix seconds. */
  t: number;
  h: number;
  l: number;
  c: number;
  volumeMicro: number;
  botVolumeMicro: number;
  n: number;
  nBot: number;
}

/** Buckets of `stepSec` seconds covering trades with fromSec <= created_at < toSec. */
export interface BucketRange {
  stepSec: number;
  fromSec: number;
  toSec: number;
}

export type ListStatus = 'all' | 'open' | 'closed' | 'resolved' | 'voided' | 'settled';
export type ListSort = 'new' | 'volume' | 'traders' | 'closing';

export interface ListFilter {
  status: ListStatus;
  tier: MarketTier | undefined;
  sort: ListSort;
  limit: number;
  offset: number;
  now: Date;
}

/** The writes of one exchange transaction. Postgres: rows locked FOR UPDATE; memory: one transaction at a time. */
export interface MarketTx {
  lockMarket(slug: string): Promise<MarketRecord | null>;
  /** Creates the account at the starting balance if missing, then locks it. */
  lockAccount(userId: string, now: Date): Promise<AccountRecord>;
  /** Locks existing accounts in user id order (the order every writer uses, so settlements cannot deadlock). */
  lockAccounts(userIds: readonly string[]): Promise<Map<string, AccountRecord>>;
  position(userId: string, marketId: string): Promise<PositionRecord | null>;
  unsettledPositions(marketId: string): Promise<PositionRecord[]>;
  savePosition(position: PositionRecord): Promise<void>;
  saveAccount(account: AccountRecord, now: Date): Promise<void>;
  saveMarket(market: MarketRecord, now: Date): Promise<void>;
  insertTrade(trade: NewTrade): Promise<TradeRecord>;
  insertResolution(resolution: ResolutionRecord): Promise<void>;
  resolution(marketId: string): Promise<ResolutionRecord | null>;
  botState(marketId: string): Promise<BotState | null>;
  saveBotState(state: BotState): Promise<void>;
}

export type InsertMarketResult = 'ok' | 'slug_taken' | 'duplicate_tweet';

/** Durable exchange state (Postgres in production, memory in tests). Routes and services depend on this only. */
export interface MarketRepository {
  transaction<T>(fn: (tx: MarketTx) => Promise<T>): Promise<T>;
  insertMarket(market: MarketRecord): Promise<InsertMarketResult>;
  /** Inserts a user row with this id if it does not exist (the seed's system creator). */
  ensureUser(userId: string, now: Date): Promise<void>;
  /** Inserts (or marks) a house market bot user: excluded from the leaderboard and the traders counter. */
  ensureBotUser(userId: string, now: Date): Promise<void>;
  marketBySlug(slug: string): Promise<MarketRecord | null>;
  marketBySourceTweet(tweetId: string): Promise<MarketRecord | null>;
  marketsByIds(ids: readonly string[]): Promise<MarketRecord[]>;
  listMarkets(filter: ListFilter): Promise<{ markets: MarketRecord[]; total: number }>;
  /** Newest first. */
  recentTrades(marketId: string, limit: number): Promise<TradeRecord[]>;
  /** The last `limit` trades' (time, price after), oldest first. */
  pricePoints(marketId: string, limit: number): Promise<Array<{ at: Date; p: number }>>;
  /**
   * Candle input: trades in `range` bucketed (oldest bucket first), and `before`, the price after the last trade
   * created before `range.fromSec` (null when there is none).
   */
  tradeBuckets(marketId: string, range: BucketRange): Promise<{ before: number | null; buckets: TradeBucket[] }>;
  /** Per market id, the price after its last trade created at or before `at`; markets with none are left out. */
  pricesAt(marketIds: readonly string[], at: Date): Promise<Map<string, number>>;
  /** Newest first. */
  userTrades(userId: string, limit: number): Promise<TradeRecord[]>;
  /** Most recently updated first. */
  userPositions(userId: string): Promise<PositionRecord[]>;
  position(userId: string, marketId: string): Promise<PositionRecord | null>;
  ensureAccount(userId: string, now: Date): Promise<AccountRecord>;
  account(userId: string): Promise<AccountRecord | null>;
  /** Human accounts only: house bots are never ranked. */
  leaderboard(limit: number): Promise<{ rows: LeaderRow[]; ranked: number }>;
  leaderRow(userId: string): Promise<LeaderRow | null>;
  marketsByImage(imageId: string): Promise<MarketRecord[]>;
  /** Clears `imageId` wherever it is this image (takedown); returns how many markets changed. */
  detachImage(imageId: string): Promise<number>;
}
