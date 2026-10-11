/**
 * Binary LMSR (logarithmic market scoring rule) used by the demo market. Pure math, no state.
 *   cost   C(qY, qN) = b * ln(e^(qY/b) + e^(qN/b))
 *   price  pYes      = e^(qY/b) / (e^(qY/b) + e^(qN/b)) = sigmoid((qY - qN) / b)
 * `b` is the liquidity: bigger b = price moves less per unit bought.
 * All exponentials are shifted by the max exponent, so large inventories cannot overflow.
 */

export type Side = 'yes' | 'no';

export type Inventory = { readonly yes: number; readonly no: number };

/** Probability of YES in (0, 1). */
export function lmsrPriceYes(q: Inventory, b: number): number {
  return 1 / (1 + Math.exp((q.no - q.yes) / b));
}

export function lmsrCost(q: Inventory, b: number): number {
  const m = Math.max(q.yes, q.no);
  return m + b * Math.log(Math.exp((q.yes - m) / b) + Math.exp((q.no - m) / b));
}

/**
 * Shares received for spending `stake` on `side` (solves C(q + shares) - C(q) = stake in closed form):
 *   shares = b * ln((e^(stake/b) * (eY + eN) - e_other) / e_side)
 */
export function sharesForStake(q: Inventory, side: Side, stake: number, b: number): number {
  if (stake <= 0) return 0;
  const m = Math.max(q.yes, q.no);
  const eYes = Math.exp((q.yes - m) / b);
  const eNo = Math.exp((q.no - m) / b);
  const eSide = side === 'yes' ? eYes : eNo;
  const eOther = side === 'yes' ? eNo : eYes;
  return b * Math.log((Math.exp(stake / b) * (eYes + eNo) - eOther) / eSide);
}

/** Inventory that opens the market at probability `p` of YES. */
export function inventoryForPrice(p: number, b: number): Inventory {
  return { yes: b * Math.log(p / (1 - p)), no: 0 };
}
