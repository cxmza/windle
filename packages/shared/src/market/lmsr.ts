/**
 * Binary LMSR (logarithmic market scoring rule). Pure math, no state; shared by the simulated exchange and any
 * future server implementation so both price identically.
 *   cost   C(qY, qN) = b * ln(e^(qY/b) + e^(qN/b))
 *   price  pYes      = sigmoid((qY - qN) / b)
 * `b` is the liquidity: bigger b = price moves less per point traded. A share pays 1 point if its side wins.
 * Exponentials are shifted by the max exponent so large inventories cannot overflow.
 * Fees are a fraction of the gross amount (buy: of the points spent; sell: of the proceeds); default 0.
 */

export type LmsrSide = 'yes' | 'no';

export interface Inventory {
  readonly yes: number;
  readonly no: number;
}

export interface FeeOptions {
  readonly fee?: number;
}

export interface BuyQuote {
  readonly shares: number;
  readonly avgPrice: number;
  readonly priceAfter: number;
  readonly maxPayout: number;
  readonly feePts: number;
  readonly stakePts: number;
}

export interface SellQuote {
  readonly proceedsPts: number;
  readonly avgPrice: number;
  readonly priceAfter: number;
  readonly feePts: number;
}

const feeOf = (opts?: FeeOptions): number => {
  const fee = opts?.fee ?? 0;
  if (!(fee >= 0 && fee < 1)) throw new RangeError('fee must be in [0, 1)');
  return fee;
};

export function lmsrCost(q: Inventory, b: number): number {
  const m = Math.max(q.yes, q.no);
  return m + b * Math.log(Math.exp((q.yes - m) / b) + Math.exp((q.no - m) / b));
}

/** Probability of YES in (0, 1). */
export function lmsrPriceYes(q: Inventory, b: number): number {
  return 1 / (1 + Math.exp((q.no - q.yes) / b));
}

export function lmsrPrice(q: Inventory, side: LmsrSide, b: number): number {
  const p = lmsrPriceYes(q, b);
  return side === 'yes' ? p : 1 - p;
}

export function withShares(q: Inventory, side: LmsrSide, delta: number): Inventory {
  return side === 'yes' ? { yes: q.yes + delta, no: q.no } : { yes: q.yes, no: q.no + delta };
}

/**
 * Shares received for spending `stake` points on `side` (solves C(q + shares) - C(q) = stake in closed form):
 *   shares = b * ln((e^(stake/b) * (eY + eN) - e_other) / e_side)
 * `stake` is the net amount that reaches the pool; use `quote` to start from a gross amount with a fee.
 */
export function sharesForStake(q: Inventory, side: LmsrSide, stake: number, b: number): number {
  if (!(stake > 0)) return 0;
  const m = Math.max(q.yes, q.no);
  const eYes = Math.exp((q.yes - m) / b);
  const eNo = Math.exp((q.no - m) / b);
  const eSide = side === 'yes' ? eYes : eNo;
  const eOther = side === 'yes' ? eNo : eYes;
  return b * Math.log((Math.exp(stake / b) * (eYes + eNo) - eOther) / eSide);
}

/** Points the pool pays out for `shares` of `side` returned to it: C(q) - C(q - shares). Gross, before any fee. */
export function proceedsForShares(q: Inventory, side: LmsrSide, shares: number, b: number): number {
  if (!(shares > 0)) return 0;
  return lmsrCost(q, b) - lmsrCost(withShares(q, side, -shares), b);
}

export function quote(q: Inventory, side: LmsrSide, amountPts: number, b: number, opts?: FeeOptions): BuyQuote {
  const fee = feeOf(opts);
  const feePts = amountPts > 0 ? amountPts * fee : 0;
  const stakePts = amountPts > 0 ? amountPts - feePts : 0;
  const shares = sharesForStake(q, side, stakePts, b);
  const after = withShares(q, side, shares);
  return {
    shares,
    avgPrice: shares > 0 ? amountPts / shares : lmsrPrice(q, side, b),
    priceAfter: lmsrPriceYes(after, b),
    maxPayout: shares,
    feePts,
    stakePts,
  };
}

export function quoteSell(q: Inventory, side: LmsrSide, shares: number, b: number, opts?: FeeOptions): SellQuote {
  const fee = feeOf(opts);
  const gross = proceedsForShares(q, side, shares, b);
  const feePts = gross * fee;
  return {
    proceedsPts: gross - feePts,
    avgPrice: shares > 0 ? (gross - feePts) / shares : lmsrPrice(q, side, b),
    priceAfter: lmsrPriceYes(withShares(q, side, -Math.max(0, shares)), b),
    feePts,
  };
}

/** Smallest non-negative inventory that opens the market at probability `p` of YES. */
export function inventoryForPrice(p: number, b: number): Inventory {
  const x = b * Math.log(p / (1 - p));
  return x >= 0 ? { yes: x, no: 0 } : { yes: 0, no: -x };
}
