import { SolanaAddress } from '../common.ts';
import { ApiImage, MediaId } from '../media.ts';
import { z } from '../zod.ts';
import { DurationPresetId } from './duration.ts';
import {
  CreateMarketInput,
  MarketFields,
  MarketSide,
  MarketTier,
  MIN_TRADE_PTS,
  Position,
  PricePoint,
  ProposedOutcome,
  refineMarket,
  Trade,
  TweetSnapshot,
} from './schema.ts';

/**
 * HTTP contracts of the server-side exchange (`/v1/markets`, `/v1/me/portfolio`, `/v1/leaderboard`).
 *
 * Points are practice points with no value. Every account starts at STARTING_BALANCE_PTS. Point amounts are exact to
 * PTS_DECIMALS decimals (the server keeps integer micro-points); shares and LMSR inventory are IEEE doubles priced
 * with the same `lmsr.ts` the client uses. Settlement is automatic: resolving a market pays every position in the
 * same transaction (1 pt per winning share, the cost basis back when voided), so there is no claim step.
 */

export const PTS_DECIMALS = 6;

const Iso = z.iso.datetime();
const Pts = z.number().finite();
const NonNegativePts = Pts.min(0);

export const MarketSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80)
  .describe('URL slug of a market, e.g. `sprout-deploys-staking-v2-to-solana-mainnet`.');

export const MarketViewer = z
  .object({
    isCreator: z.boolean(),
    canTrade: z.boolean().describe('Open, before the deadline, and the viewer is not the creator.'),
    canResolve: z.boolean().describe('The viewer is the creator or an admin and the market is not settled yet.'),
  })
  .describe('What the signed-in viewer may do with this market. Absent for anonymous requests.');
export type MarketViewer = z.infer<typeof MarketViewer>;

export const MarketStats = z
  .object({
    change24hPp: z
      .number()
      .finite()
      .nullable()
      .describe(
        'Change of the YES price over the last 24 hours (since creation for a younger market), in percentage ' +
          'points: 0.62 -> 0.66 is 4. null while the market has no trades.',
      ),
    buys: z.number().int().min(0).describe('Buy trades, house market bots included.'),
    sells: z.number().int().min(0).describe('Sell trades, house market bots included.'),
    botTrades: z.number().int().min(0).describe('Trades by house market bots (same as `botTradeCount`).'),
    humanTraders: z.number().int().min(0).describe('Distinct people who traded (same as `traders`).'),
  })
  .describe('Activity counters for the market header and cards.');
export type MarketStats = z.infer<typeof MarketStats>;

/**
 * A server market: the shared `Market` plus server facts. `id` is a uuid; `deadline` is when trading stops
 * (`closes_at`); `status` is one of open | closed (deadline passed, awaiting resolution) | resolved | voided.
 */
export const ApiMarket = MarketFields.extend({
  volumePts: NonNegativePts.describe('Points traded on this market, house market bots included (see `botVolumePts`).'),
  traders: z.number().int().min(0).describe('Distinct human traders. House market bots are never counted here.'),
  tradable: z.boolean().describe('status is open and the deadline has not passed.'),
  tradeCount: z.number().int().min(0).describe('Every trade, house market bots included (see `botTradeCount`).'),
  botVolumePts: NonNegativePts.optional().describe(
    'Part of `volumePts` traded by house market bots. Always sent by the api.',
  ),
  botTradeCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Part of `tradeCount` made by house market bots. Always sent by the api.'),
  shareUrl: z.url().describe('Public share link with a rich preview card (X, Telegram, Discord).'),
  durationPreset: DurationPresetId.nullable()
    .optional()
    .describe(
      'The DURATION_PRESETS id the market was created with; null for a custom deadline. Always sent by the api.',
    ),
  stats: MarketStats.optional().describe('Always sent by the api.'),
  image: ApiImage.nullable()
    .optional()
    .describe('Market/token image chosen by the creator; null when none (or taken down). Always sent by the api.'),
  viewer: MarketViewer.optional(),
}).superRefine(refineMarket);
export type ApiMarket = z.infer<typeof ApiMarket>;

export const ApiTrade = Trade.extend({
  marketSlug: MarketSlug,
  bot: z
    .boolean()
    .optional()
    .describe(
      'True for a trade by a house market bot (an open, labelled liquidity bot; never a person). Always sent by ' +
        'the api.',
    ),
  botName: z
    .string()
    .min(1)
    .max(40)
    .optional()
    .describe('Display name of the house market bot, e.g. "Market bot #2". Present only when `bot` is true.'),
  avatar: ApiImage.nullable()
    .optional()
    .describe("The trader's profile image; null when none. Always sent by the api."),
}).describe(
  '`costPts` is points paid (buy) or received (sell). `by` is the wallet the trade was signed in with; for a house ' +
    'market bot (`bot: true`) it is a reserved id of the form `MarketBot<n>111…`, not a wallet: show `botName`.',
);
export type ApiTrade = z.infer<typeof ApiTrade>;

export const ApiPosition = Position.extend({
  marketSlug: MarketSlug,
  valuePts: NonNegativePts.describe('Held shares at the current price; 0 once the market is settled.'),
  payoutPts: NonNegativePts.nullable().describe('Points credited at settlement; null while the market is unsettled.'),
  settledAt: Iso.nullable(),
}).describe('`claimed` is true once the market is settled: payouts are automatic, there is nothing to claim.');
export type ApiPosition = z.infer<typeof ApiPosition>;

export const MARKET_LIST_STATUSES = ['all', 'open', 'closed', 'resolved', 'voided', 'settled'] as const;
export const MARKET_LIST_SORTS = ['new', 'volume', 'traders', 'closing'] as const;

export const MarketListQuery = z.object({
  status: z
    .enum(MARKET_LIST_STATUSES)
    .default('all')
    .describe('`open`: tradable now; `closed`: deadline passed, awaiting resolution; `settled`: resolved or voided.'),
  tier: MarketTier.optional(),
  sort: z
    .enum(MARKET_LIST_SORTS)
    .default('new')
    .describe('`new`: newest first; `volume`, `traders`: largest first; `closing`: nearest deadline first.'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type MarketListQuery = z.input<typeof MarketListQuery>;

export const MarketListResponse = z.object({
  markets: z.array(ApiMarket),
  total: z.number().int().min(0),
  nextOffset: z.number().int().min(0).nullable(),
});
export type MarketListResponse = z.infer<typeof MarketListResponse>;

export const MarketDetailResponse = z.object({
  market: ApiMarket,
  trades: z.array(ApiTrade).describe('Most recent trades, newest first (up to 50).'),
  history: z
    .array(PricePoint)
    .describe('Probability of YES over time, oldest first: the opening price, one point per trade, then now.'),
  position: ApiPosition.nullable().describe("The signed-in viewer's position; null when signed out or none."),
});
export type MarketDetailResponse = z.infer<typeof MarketDetailResponse>;

export const CANDLE_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export const CandleTimeframe = z.enum(CANDLE_TIMEFRAMES);
export type CandleTimeframe = z.infer<typeof CandleTimeframe>;

export const CANDLE_TIMEFRAME_SECONDS: Record<CandleTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
};

export const CANDLES_DEFAULT_LIMIT = 300;
export const CANDLES_MAX_LIMIT = 1000;

export const CandlesQuery = z.object({
  tf: CandleTimeframe.default('5m').describe('Bucket size. Buckets are aligned to the Unix epoch (UTC).'),
  side: MarketSide.default('yes').describe('`no` prices are 1 - yes (high and low swap).'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CANDLES_MAX_LIMIT)
    .default(CANDLES_DEFAULT_LIMIT)
    .describe('The most recent buckets to return.'),
});
export type CandlesQuery = z.input<typeof CandlesQuery>;

const Prob = z.number().min(0).max(1);

export const Candle = z.object({
  t: z.number().int().describe('Bucket start, Unix seconds.'),
  o: Prob.describe('Price of the chosen side when the bucket opened (the previous close).'),
  h: Prob,
  l: Prob,
  c: Prob.describe('Price after the last trade in the bucket; the open when nothing traded.'),
  v: NonNegativePts.describe('Points traded, house market bots included.'),
  vBot: NonNegativePts.describe('Part of `v` traded by house market bots.'),
  n: z.number().int().min(0).describe('Trades, house market bots included.'),
  nBot: z.number().int().min(0).describe('Part of `n` made by house market bots.'),
});
export type Candle = z.infer<typeof Candle>;

export const CandlesResponse = z.object({
  tf: CandleTimeframe,
  side: MarketSide,
  candles: z
    .array(Candle)
    .describe('Oldest first, one per bucket with no gaps; the last bucket is still forming while the market trades.'),
  from: z.number().int().describe('Start of the first candle, Unix seconds.'),
  to: z
    .number()
    .int()
    .describe('End of the data, Unix seconds: now, or the close (resolution) time once trading has stopped.'),
});
export type CandlesResponse = z.infer<typeof CandlesResponse>;

/**
 * The create wizard's input plus the tweet snapshot the wizard looked up. `tweetUrl` must point at `source.id`
 * (send `source.url`). The server re-reads the tweet from X when it can and stores its own copy; otherwise it keeps
 * this snapshot. Only `community` markets can be created through the api.
 */
export const CreateMarketRequest = CreateMarketInput.safeExtend({
  source: TweetSnapshot,
  imageId: MediaId.optional().describe('An image the creator uploaded (`POST /v1/media`), shown as `market.image`.'),
});
export type CreateMarketRequest = z.input<typeof CreateMarketRequest>;

export const CreateMarketResponse = z.object({ market: ApiMarket });
export type CreateMarketResponse = z.infer<typeof CreateMarketResponse>;

export const BuyRequest = z.object({
  action: z.literal('buy'),
  side: MarketSide,
  amountPts: Pts.min(MIN_TRADE_PTS)
    .max(1_000_000_000)
    .describe(`Points to spend (at least ${MIN_TRADE_PTS}); rounded down to ${PTS_DECIMALS} decimals.`),
  minShares: z
    .number()
    .finite()
    .min(0)
    .optional()
    .describe('Slippage guard: fail with `slippage_exceeded` if fewer shares would be received.'),
});

export const SellRequest = z.object({
  action: z.literal('sell'),
  side: MarketSide,
  shares: z
    .number()
    .finite()
    .positive()
    .max(1e12)
    .describe('Shares to sell. A value within 1e-9 of the holding sells all of it.'),
  minProceedsPts: Pts.min(0)
    .optional()
    .describe('Slippage guard: fail with `slippage_exceeded` if fewer points would be received.'),
});

export const TradeRequest = z.discriminatedUnion('action', [BuyRequest, SellRequest]);
export type TradeRequest = z.infer<typeof TradeRequest>;

export const TradeResponse = z.object({
  trade: ApiTrade,
  market: ApiMarket,
  position: ApiPosition,
  balancePts: NonNegativePts,
});
export type TradeResponse = z.infer<typeof TradeResponse>;

export const ResolveRequest = z.object({
  outcome: ProposedOutcome.describe(
    '`yes` / `no`: that side wins 1 pt per share; `void`: every cost basis is refunded.',
  ),
  note: z.string().trim().min(1).max(500).optional().describe('Evidence or reasoning, shown on the market.'),
});
export type ResolveRequest = z.infer<typeof ResolveRequest>;

export const Settlement = z.object({
  outcome: ProposedOutcome,
  method: z.enum(['creator', 'admin']),
  positions: z.number().int().min(0).describe('Positions paid out.'),
  payoutPts: NonNegativePts.describe('Total points credited.'),
  resolvedAt: Iso,
});
export type Settlement = z.infer<typeof Settlement>;

export const ResolveResponse = z.object({
  market: ApiMarket,
  settlement: Settlement,
  alreadyResolved: z
    .boolean()
    .describe('True when the market already had this outcome: nothing changed (the call is idempotent).'),
});
export type ResolveResponse = z.infer<typeof ResolveResponse>;

export const ApiPortfolio = z.object({
  balancePts: NonNegativePts,
  startingBalancePts: NonNegativePts,
  openValuePts: NonNegativePts.describe('Held shares of unsettled markets at current prices.'),
  netWorthPts: NonNegativePts.describe('balancePts + openValuePts; what the leaderboard ranks.'),
  pnlPts: Pts.describe('netWorthPts - startingBalancePts.'),
  rank: z.number().int().min(1).nullable().describe('Leaderboard rank; null until the first trade.'),
  positions: z.array(ApiPosition).describe('Most recently traded first.'),
  markets: z.array(ApiMarket).describe('Every market referenced by `positions`.'),
  history: z.array(ApiTrade).describe("The user's own trades, newest first (up to 100)."),
});
export type ApiPortfolio = z.infer<typeof ApiPortfolio>;

export const LeaderboardEntry = z.object({
  rank: z.number().int().min(1),
  address: SolanaAddress,
  netWorthPts: NonNegativePts,
  balancePts: NonNegativePts,
  openValuePts: NonNegativePts,
  pnlPts: Pts,
  marketsTraded: z.number().int().min(0),
  avatar: ApiImage.nullable().optional().describe('Profile image; null when none. Always sent by the api.'),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const LeaderboardMe = LeaderboardEntry.extend({
  rank: z.number().int().min(1).nullable().describe('null until the first trade (only traders are ranked).'),
});
export type LeaderboardMe = z.infer<typeof LeaderboardMe>;

export const LeaderboardResponse = z.object({
  entries: z
    .array(LeaderboardEntry)
    .describe('Top 100 by net worth; ties share a rank. House market bots are never ranked or counted.'),
  me: LeaderboardMe.nullable().describe('The signed-in caller; null for anonymous requests.'),
  rankedTraders: z.number().int().min(0),
  startingBalancePts: NonNegativePts,
  updatedAt: Iso.describe('When `entries` was computed (cached for a few seconds).'),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponse>;
