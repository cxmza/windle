import { SolanaAddress } from '../common.ts';
import { XCard, XMediaVariant, XMetrics } from '../x-feed.ts';
import { z } from '../zod.ts';
import { DurationPresetId } from './duration.ts';

/**
 * Promise-market contracts. Canonical side in data is 'yes' | 'no'; the UI says "Ships" / "Doesn't ship"
 * (see SIDE_LABELS). Currency is points ("Pts" suffix) for everything traded; "Sol" fields are the team's collateral
 * stake and are never a trading currency. Timestamps are ISO-8601 strings, except PricePoint.t (epoch ms, chart-friendly).
 */

const Iso = z.iso.datetime();
const Pts = z.number().finite();
const NonNegativePts = Pts.min(0);

export const MarketSide = z.enum(['yes', 'no']);
export type MarketSide = z.infer<typeof MarketSide>;

export const SIDE_LABELS = {
  community: { yes: 'Ships', no: "Doesn't ship" },
  backed: { yes: 'Ships', no: 'Slashed' },
} as const satisfies Record<string, Record<MarketSide, string>>;

export const MarketTier = z.enum(['community', 'backed']);
export type MarketTier = z.infer<typeof MarketTier>;

/** open -> closed (deadline passed) -> proposed -> disputed -> resolved | voided. Backed markets skip proposed/disputed. */
export const MARKET_STATUSES = ['open', 'closed', 'proposed', 'disputed', 'resolved', 'voided'] as const;
export const MarketStatus = z.enum(MARKET_STATUSES);
export type MarketStatus = z.infer<typeof MarketStatus>;

export const Outcome = MarketSide;
export type Outcome = MarketSide;

export const ProposedOutcome = z.enum(['yes', 'no', 'void']);
export type ProposedOutcome = z.infer<typeof ProposedOutcome>;

export const TweetAuthor = z.object({
  handle: z.string().min(1).max(15),
  name: z.string().min(1).max(80),
  avatarUrl: z.url().optional(),
  verified: z.boolean().optional(),
});
export type TweetAuthor = z.infer<typeof TweetAuthor>;

/**
 * `poster`, `gif`, the size, the duration and the playable `variants` are what a player needs to reserve its box and
 * play the file; they are optional because older snapshots hold only the url.
 */
export const TweetMedia = z.object({
  kind: z.enum(['image', 'video']),
  url: z.url(),
  alt: z.string().optional(),
  poster: z.url().optional(),
  gif: z.boolean().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  variants: z.array(XMediaVariant).max(12).optional(),
});
export type TweetMedia = z.infer<typeof TweetMedia>;

/** Stored at market creation, because tweets get deleted. */
export const TweetSnapshot = z.object({
  id: z.string().regex(/^\d{5,25}$/),
  url: z.url(),
  author: TweetAuthor,
  text: z.string().min(1).max(1000),
  createdAt: Iso,
  media: z.array(TweetMedia).optional(),
  /** Link preview and counts as they were when the market was made, so the page has its final shape before X answers. */
  card: XCard.optional(),
  metrics: XMetrics.optional(),
  capturedAt: Iso,
});
export type TweetSnapshot = z.infer<typeof TweetSnapshot>;

export const ProjectRef = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(60),
  ticker: z.string().regex(/^[A-Z0-9]{2,10}$/),
  mint: SolanaAddress.optional().describe('pump.fun token mint'),
});
export type ProjectRef = z.infer<typeof ProjectRef>;

/** The team's stake behind a backed market. Denominated in SOL, never traded. */
export const Collateral = z.object({
  amountSol: z.number().positive().finite(),
  check: z.string().min(1).max(500).describe('On-chain verifiable condition that decides the market.'),
});
export type Collateral = z.infer<typeof Collateral>;

export const EvidenceKind = z.enum(['link', 'tx', 'tweet', 'note']);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const Evidence = z.object({
  kind: EvidenceKind,
  url: z.url().optional(),
  text: z.string().min(1).max(500),
});
export type Evidence = z.infer<typeof Evidence>;

export const Dispute = z.object({
  by: SolanaAddress,
  bondPts: Pts.positive(),
  reason: z.string().min(1).max(500),
  at: Iso,
});
export type Dispute = z.infer<typeof Dispute>;

/**
 * `resolver`/`chain`: the dispute-window model (community resolver, on-chain check). `creator`/`admin`: the api's
 * direct resolution (the market's creator, or a wallet in the server's admin list); final at once, no disputes.
 */
export const ResolutionMethod = z.enum(['resolver', 'chain', 'creator', 'admin']);
export type ResolutionMethod = z.infer<typeof ResolutionMethod>;

export const Resolution = z.object({
  method: ResolutionMethod,
  proposedOutcome: ProposedOutcome,
  evidence: z.array(Evidence),
  proposedAt: Iso,
  disputeEndsAt: Iso,
  disputes: z.array(Dispute),
  finalOutcome: ProposedOutcome.optional(),
  resolvedAt: Iso.optional(),
});
export type Resolution = z.infer<typeof Resolution>;

export const MarketFields = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  tier: MarketTier,
  status: MarketStatus,
  project: ProjectRef,
  statement: z.string().min(1).max(280),
  criteria: z.string().min(1).max(1000),
  deadline: Iso,
  createdAt: Iso,
  creator: SolanaAddress,
  source: TweetSnapshot.optional().describe('Required for community markets.'),
  liquidityB: z.number().positive().finite(),
  qYes: z.number().finite(),
  qNo: z.number().finite(),
  probYes: z.number().min(0).max(1),
  volumePts: NonNegativePts,
  traders: z.number().int().min(0),
  collateral: Collateral.optional(),
  resolution: Resolution.optional(),
});

/** Cross-field rules every market obeys; shared by `Market` and the api's `ApiMarket`. */
export function refineMarket(m: z.infer<typeof MarketFields>, ctx: z.RefinementCtx): void {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (m.tier === 'community' && !m.source) issue('source', 'community markets need a tweet snapshot');
  if (m.tier === 'community' && m.collateral) issue('collateral', 'community markets have no collateral');
  if (m.tier === 'backed' && !m.collateral) issue('collateral', 'backed markets need collateral');
  const r = m.resolution;
  const needs = (ok: boolean, message: string) => !ok && issue('resolution', message);
  switch (m.status) {
    case 'open':
    case 'closed':
      needs(r === undefined, 'no resolution before a proposal');
      break;
    case 'proposed':
      needs(
        r !== undefined && r.finalOutcome === undefined && r.disputes.length === 0,
        'proposed: open proposal, no disputes',
      );
      break;
    case 'disputed':
      needs(
        r !== undefined && r.finalOutcome === undefined && r.disputes.length > 0,
        'disputed: at least one dispute, not final',
      );
      break;
    case 'resolved':
      needs(r?.finalOutcome === 'yes' || r?.finalOutcome === 'no', 'resolved: finalOutcome yes or no');
      needs(r?.resolvedAt !== undefined, 'resolved: resolvedAt');
      break;
    case 'voided':
      needs(r?.finalOutcome === 'void' && r.resolvedAt !== undefined, 'voided: finalOutcome void and resolvedAt');
      break;
  }
  if (m.tier === 'backed' && r && r.method !== 'chain' && r.method !== 'admin')
    issue('resolution', 'backed markets resolve from chain state (or by an admin)');
  if (m.tier === 'community' && r && r.method === 'chain')
    issue('resolution', 'community markets have no on-chain check');
}

export const Market = MarketFields.superRefine(refineMarket);
export type Market = z.infer<typeof Market>;

export const TradeAction = z.enum(['buy', 'sell']);
export type TradeAction = z.infer<typeof TradeAction>;

export const Trade = z.object({
  id: z.string().min(1),
  marketId: z.string().min(1),
  action: TradeAction,
  side: MarketSide,
  shares: z.number().positive().finite(),
  costPts: NonNegativePts.describe('Points paid (buy) or received (sell).'),
  priceBefore: z.number().min(0).max(1).describe('Probability of YES before the trade.'),
  priceAfter: z.number().min(0).max(1).describe('Probability of YES after the trade.'),
  by: SolanaAddress,
  at: Iso,
});
export type Trade = z.infer<typeof Trade>;

export const Position = z.object({
  marketId: z.string().min(1),
  yesShares: NonNegativePts,
  noShares: NonNegativePts,
  yesCostPts: NonNegativePts,
  noCostPts: NonNegativePts,
  costBasisPts: NonNegativePts.describe('yesCostPts + noCostPts: points still at risk in this position.'),
  realizedPts: Pts,
  claimed: z.boolean(),
});
export type Position = z.infer<typeof Position>;

export const PricePoint = z.object({
  t: z.number().int().describe('Epoch ms.'),
  p: z.number().min(0).max(1).describe('Probability of YES.'),
});
export type PricePoint = z.infer<typeof PricePoint>;

export const Portfolio = z.object({
  balancePts: NonNegativePts,
  positions: z.array(Position),
  history: z.array(Trade).describe("The user's own trades, newest first."),
});
export type Portfolio = z.infer<typeof Portfolio>;

export const STARTING_BALANCE_PTS = 1000;
export const MIN_TRADE_PTS = 1;
export const DEFAULT_LIQUIDITY_B = 50;

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const CreateMarketInput = z
  .object({
    tweetUrl: z.string().trim().min(1),
    tier: MarketTier.default('community'),
    statement: trimmed(10, 200),
    criteria: trimmed(10, 800),
    deadline: Iso.optional().describe('Custom close time. Required unless `durationPreset` is set (then ignored).'),
    durationPreset: DurationPresetId.optional().describe(
      'Close the market at now + the duration of the preset (see DURATION_PRESETS); `deadline` is then ignored.',
    ),
    project: z.object({
      name: trimmed(2, 40),
      ticker: z
        .string()
        .trim()
        .transform((s) => s.replace(/^\$/, '').toUpperCase())
        .pipe(z.string().regex(/^[A-Z0-9]{2,10}$/, '2-10 letters or digits')),
      mint: SolanaAddress.optional(),
    }),
    initialProbYes: z.number().min(0.05).max(0.95).default(0.5),
    liquidityB: z.number().min(10).max(500).default(DEFAULT_LIQUIDITY_B),
    collateral: Collateral.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.deadline === undefined && v.durationPreset === undefined)
      ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'pick a deadline or a duration preset' });
    if (v.tier === 'backed' && !v.collateral)
      ctx.addIssue({ code: 'custom', path: ['collateral'], message: 'backed markets need collateral' });
    if (v.tier === 'community' && v.collateral)
      ctx.addIssue({ code: 'custom', path: ['collateral'], message: 'community markets have no collateral' });
  });
export type CreateMarketInput = z.input<typeof CreateMarketInput>;
export type CreateMarketData = z.output<typeof CreateMarketInput>;

/** localStorage payload of the simulated exchange. `created` holds user-made markets in their initial state. */
export const PersistedExchange = z.object({
  v: z.literal(1),
  balancePts: NonNegativePts,
  positions: z.array(Position),
  userTrades: z.array(Trade),
  created: z.array(z.unknown()),
});
export type PersistedExchange = z.infer<typeof PersistedExchange>;
