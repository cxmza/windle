import {
  type ApiMarket,
  type BuyQuote,
  type Inventory,
  quote as lmsrQuote,
  type MarketSide,
  MIN_TRADE_PTS,
  quoteSell,
  type SellQuote,
} from '@windle/shared';
import { floorTo } from './market/trade-copy';

/** How far the price may move between the quote on screen and the order landing before the server refuses it. */
export const SLIPPAGE_TOLERANCE = 0.02;

const EPS = 1e-9;

type Tradable = Pick<ApiMarket, 'tradable' | 'deadline' | 'viewer'>;

export const isTradable = (m: Pick<ApiMarket, 'tradable' | 'deadline'>, now: number): boolean =>
  m.tradable && now < Date.parse(m.deadline);

export type TradeBlock = 'closed' | 'creator';

/** Why this viewer cannot trade the market right now; null when they can. */
export function tradeBlock(m: Tradable, now: number): TradeBlock | null {
  if (!isTradable(m, now)) return 'closed';
  return m.viewer?.isCreator ? 'creator' : null;
}

export const CREATOR_BLOCK_TEXT = 'You created this market';

const inventoryOf = (m: Pick<ApiMarket, 'qYes' | 'qNo'>): Inventory => ({ yes: m.qYes, no: m.qNo });

export type QuoteProblem = 'invalid_amount' | 'insufficient_balance' | 'insufficient_shares';

type Pricing = Pick<ApiMarket, 'qYes' | 'qNo' | 'liquidityB'>;

/** `balancePts` is null while the portfolio is still loading: the balance check waits, the server still enforces it. */
export function previewBuy(
  market: Pricing,
  balancePts: number | null,
  side: MarketSide,
  amountPts: number,
): { quote: BuyQuote | null; problem: QuoteProblem | null } {
  if (!Number.isFinite(amountPts) || amountPts < MIN_TRADE_PTS) return { quote: null, problem: 'invalid_amount' };
  const quote = lmsrQuote(inventoryOf(market), side, amountPts, market.liquidityB);
  if (balancePts !== null && amountPts > balancePts + EPS) return { quote, problem: 'insufficient_balance' };
  return { quote, problem: null };
}

export function previewSell(
  market: Pricing,
  ownedShares: number,
  side: MarketSide,
  shares: number,
): { quote: SellQuote | null; problem: QuoteProblem | null } {
  if (!Number.isFinite(shares) || shares <= 0) return { quote: null, problem: 'invalid_amount' };
  const quote = quoteSell(inventoryOf(market), side, shares, market.liquidityB);
  if (shares > ownedShares * (1 + EPS) + EPS) return { quote, problem: 'insufficient_shares' };
  return { quote, problem: null };
}

export function buyGuard(market: Pricing, side: MarketSide, amountPts: number): { minShares: number } {
  const { shares } = lmsrQuote(inventoryOf(market), side, amountPts, market.liquidityB);
  return { minShares: Math.max(0, shares * (1 - SLIPPAGE_TOLERANCE)) };
}

export function sellGuard(market: Pricing, side: MarketSide, shares: number): { minProceedsPts: number } {
  const { proceedsPts } = quoteSell(inventoryOf(market), side, shares, market.liquidityB);
  return { minProceedsPts: Math.max(0, proceedsPts * (1 - SLIPPAGE_TOLERANCE)) };
}

/** The Max chip fills 8 decimals; selling "all but dust" would leave a position nobody can see, so send the exact holding. */
export const sellAmount = (shares: number, owned: number): number => (shares >= floorTo(owned, 8) ? owned : shares);
