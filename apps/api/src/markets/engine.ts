import {
  type Inventory,
  lmsrPriceYes,
  type MarketSide,
  MIN_TRADE_PTS,
  type ProposedOutcome,
  proceedsForShares,
  quote,
  STARTING_BALANCE_PTS,
  type TradeRequest,
  withShares,
} from '@windle/shared';
import { HttpError } from '../errors.ts';
import type { AccountRecord, MarketRecord, NewTrade, PositionRecord, ResolverRole } from './types.ts';

/**
 * The exchange rules as pure functions over records: no I/O, so they are unit-tested directly and shared by the
 * Postgres and memory repositories. Points are integer micro-points; shares are floats from @windle/shared/lmsr.
 */

export const MICRO = 1_000_000;
export const STARTING_BALANCE_MICRO = STARTING_BALANCE_PTS * MICRO;
/** Relative tolerance for "sell everything I hold" (a client echoes the float it was given). */
const SHARE_EPS = 1e-9;

/** Points to micro-points, rounded down; the epsilon absorbs binary noise such as 1.005 * 1e6 = 1004999.9999999999. */
export const toMicro = (pts: number): number => Math.floor(pts * MICRO + 1e-6);
export const fromMicro = (micro: number): number => micro / MICRO;

export const isTradable = (m: MarketRecord, now: Date): boolean =>
  m.status === 'open' && now.getTime() < m.closesAt.getTime();

export const inventoryOf = (m: MarketRecord): Inventory => ({ yes: m.qYes, no: m.qNo });

export function emptyPosition(userId: string, marketId: string, now: Date): PositionRecord {
  return {
    userId,
    marketId,
    yesShares: 0,
    noShares: 0,
    yesCostMicro: 0,
    noCostMicro: 0,
    realizedMicro: 0,
    payoutMicro: null,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Value of unsettled held shares at the market's current price, in points. */
export function markValuePts(p: PositionRecord, m: MarketRecord): number {
  if (p.settledAt !== null) return 0;
  return p.yesShares * m.probYes + p.noShares * (1 - m.probYes);
}

export interface TradeInput {
  market: MarketRecord;
  account: AccountRecord;
  position: PositionRecord | null;
  userId: string;
  walletAddress: string;
  now: Date;
  request: TradeRequest;
  /** A house market bot: counted in the bot counters, never in `traders`. */
  bot?: boolean;
}

export interface TradeOutcome {
  market: MarketRecord;
  account: AccountRecord;
  position: PositionRecord;
  trade: NewTrade;
}

function assertTradable(market: MarketRecord, userId: string, now: Date) {
  if (market.creatorId === userId)
    throw new HttpError(403, 'creator_cannot_trade', 'You created this market, so you cannot trade on it');
  if (market.status !== 'open') throw new HttpError(409, 'market_closed', 'This market is settled');
  if (now.getTime() >= market.closesAt.getTime())
    throw new HttpError(409, 'market_closed', 'Trading closed at the deadline');
}

const sideShares = (p: PositionRecord, side: MarketSide) => (side === 'yes' ? p.yesShares : p.noShares);
const sideCost = (p: PositionRecord, side: MarketSide) => (side === 'yes' ? p.yesCostMicro : p.noCostMicro);

function withSide(p: PositionRecord, side: MarketSide, shares: number, costMicro: number): PositionRecord {
  return side === 'yes'
    ? { ...p, yesShares: shares, yesCostMicro: costMicro }
    : { ...p, noShares: shares, noCostMicro: costMicro };
}

export function applyTrade(input: TradeInput): TradeOutcome {
  const { market, account, userId, walletAddress, now, request } = input;
  const bot = input.bot ?? false;
  assertTradable(market, userId, now);
  const before = inventoryOf(market);
  const b = market.liquidityB;
  const priceBefore = market.probYes;
  const prev = input.position ?? emptyPosition(userId, market.id, now);
  if (prev.settledAt !== null) throw new HttpError(409, 'market_closed', 'This market is settled');
  const side = request.side;

  let shares: number;
  let costMicro: number;
  let after: Inventory;
  let position: PositionRecord;
  let balanceMicro: number;

  if (request.action === 'buy') {
    costMicro = toMicro(request.amountPts);
    if (costMicro < MIN_TRADE_PTS * MICRO)
      throw new HttpError(422, 'invalid_amount', `Spend at least ${MIN_TRADE_PTS} pt`);
    if (costMicro > account.balanceMicro)
      throw new HttpError(422, 'insufficient_balance', 'Not enough practice points for this trade', undefined, {
        balancePts: String(fromMicro(account.balanceMicro)),
      });
    shares = quote(before, side, fromMicro(costMicro), b).shares;
    if (!(Number.isFinite(shares) && shares > 0))
      throw new HttpError(422, 'invalid_amount', 'This amount buys no shares');
    if (request.minShares !== undefined && shares < request.minShares)
      throw new HttpError(
        422,
        'slippage_exceeded',
        'The price moved: you would get fewer shares than your minimum',
        undefined,
        { shares: String(shares) },
      );
    after = withShares(before, side, shares);
    position = withSide(prev, side, sideShares(prev, side) + shares, sideCost(prev, side) + costMicro);
    balanceMicro = account.balanceMicro - costMicro;
  } else {
    const owned = sideShares(prev, side);
    if (!(owned > 0) || request.shares > owned * (1 + SHARE_EPS) + SHARE_EPS)
      throw new HttpError(422, 'insufficient_shares', 'You do not hold that many shares', undefined, {
        heldShares: String(owned),
      });
    const sellAll = owned - request.shares <= owned * SHARE_EPS + SHARE_EPS;
    shares = sellAll ? owned : request.shares;
    costMicro = toMicro(proceedsForShares(before, side, shares, b));
    if (request.minProceedsPts !== undefined && costMicro < toMicro(request.minProceedsPts))
      throw new HttpError(
        422,
        'slippage_exceeded',
        'The price moved: you would receive less than your minimum',
        undefined,
        {
          proceedsPts: String(fromMicro(costMicro)),
        },
      );
    const cost = sideCost(prev, side);
    const removed = sellAll ? cost : Math.min(cost, Math.round((cost * shares) / owned));
    after = withShares(before, side, -shares);
    position = {
      ...withSide(prev, side, sellAll ? 0 : owned - shares, cost - removed),
      realizedMicro: prev.realizedMicro + costMicro - removed,
    };
    balanceMicro = account.balanceMicro + costMicro;
  }

  const priceAfter = lmsrPriceYes(after, b);
  return {
    market: {
      ...market,
      qYes: after.yes,
      qNo: after.no,
      probYes: priceAfter,
      volumeMicro: market.volumeMicro + costMicro,
      tradeCount: market.tradeCount + 1,
      buyCount: market.buyCount + (request.action === 'buy' ? 1 : 0),
      traders: market.traders + (input.position === null && !bot ? 1 : 0),
      botVolumeMicro: market.botVolumeMicro + (bot ? costMicro : 0),
      botTradeCount: market.botTradeCount + (bot ? 1 : 0),
    },
    account: { ...account, balanceMicro },
    position: { ...position, updatedAt: now },
    trade: {
      marketId: market.id,
      marketSlug: market.slug,
      userId,
      walletAddress,
      action: request.action,
      side,
      shares,
      costMicro,
      priceBefore,
      priceAfter,
      bot,
      createdAt: now,
    },
  };
}

export interface ResolveInput {
  market: MarketRecord;
  userId: string;
  isAdmin: boolean;
  outcome: ProposedOutcome;
  now: Date;
}

/**
 * Who may resolve and when. Admins: any outcome, any time. The creator: YES or VOID any time (a promise can be kept
 * early), NO only once the deadline has passed (until then the promise can still be kept).
 */
export function resolverRole(input: ResolveInput): ResolverRole {
  const { market, userId, isAdmin, outcome, now } = input;
  if (isAdmin) return 'admin';
  if (market.creatorId !== userId)
    throw new HttpError(403, 'forbidden', 'Only the creator of this market or an admin can resolve it');
  if (outcome === 'no' && now.getTime() < market.closesAt.getTime())
    throw new HttpError(409, 'resolve_too_early', 'NO can be decided only after the deadline');
  return 'creator';
}

/** Points a position receives at settlement: 1 pt per winning share (rounded down), the cost basis when voided. */
export function payoutMicro(p: PositionRecord, outcome: ProposedOutcome): number {
  if (outcome === 'void') return p.yesCostMicro + p.noCostMicro;
  return toMicro(outcome === 'yes' ? p.yesShares : p.noShares);
}

export interface SettleOutcome {
  market: MarketRecord;
  positions: PositionRecord[];
  accounts: AccountRecord[];
  payoutMicro: number;
}

export function settle(
  market: MarketRecord,
  open: readonly PositionRecord[],
  accounts: ReadonlyMap<string, AccountRecord>,
  resolution: { outcome: ProposedOutcome; role: ResolverRole; userId: string; note: string | null; now: Date },
): SettleOutcome {
  const { outcome, now } = resolution;
  let total = 0;
  const credited = new Map<string, AccountRecord>();
  const positions = open.map((p) => {
    const paid = payoutMicro(p, outcome);
    total += paid;
    const account = credited.get(p.userId) ?? accounts.get(p.userId);
    if (!account) throw new Error(`settle: no account for position holder ${p.userId}`);
    credited.set(p.userId, { ...account, balanceMicro: account.balanceMicro + paid });
    const basis = p.yesCostMicro + p.noCostMicro;
    return {
      ...p,
      yesCostMicro: 0,
      noCostMicro: 0,
      realizedMicro: p.realizedMicro + paid - basis,
      payoutMicro: paid,
      settledAt: now,
      updatedAt: now,
    };
  });
  return {
    market: {
      ...market,
      status: outcome === 'void' ? 'voided' : 'resolved',
      outcome,
      resolvedAt: now,
      resolvedBy: resolution.userId,
      resolutionMethod: resolution.role,
      resolutionNote: resolution.note,
    },
    positions,
    accounts: [...credited.values()],
    payoutMicro: total,
  };
}
