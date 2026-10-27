import type { ApiMarket, MarketSide } from '@windle/shared';
import type { PositionView } from '../selectors';

export type PositionFilter = 'open' | 'settled';

export interface PositionRow {
  key: string;
  view: PositionView;
  side: MarketSide | null;
  shares: number;
  avgCost: number | null;
  /** Probability that this row's side wins right now (0..1). */
  price: number | null;
  valuePts: number;
  /** Unrealized on the held side, plus the position's realized result on its first row. */
  pnlPts: number;
  first: boolean;
}

const priceOf = (m: ApiMarket, side: MarketSide): number => (side === 'yes' ? m.probYes : 1 - m.probYes);

/** Open: shares at today's price. Settled: what the side paid; a voided market refunds the whole position on its first row. */
function sideValue(v: PositionView, side: MarketSide, shares: number, first: boolean): number {
  if (!v.settled) return shares * priceOf(v.market, side);
  if (v.market.status === 'voided') return first ? (v.payoutPts ?? 0) : 0;
  return v.market.resolution?.finalOutcome === side ? shares : 0;
}

/** One row per held side. A position that was fully sold keeps a single row carrying its realized result. */
export function positionRows(positions: readonly PositionView[], filter: PositionFilter): PositionRow[] {
  const rows: PositionRow[] = [];
  for (const v of positions) {
    if (v.settled !== (filter === 'settled')) continue;
    const held = (
      [
        ['yes', v.yesShares, v.yesCostPts],
        ['no', v.noShares, v.noCostPts],
      ] as const
    ).filter(([, shares]) => shares > 0);
    if (held.length === 0) {
      if (v.realizedPts === 0 && !v.settled) continue;
      rows.push({
        key: `${v.marketId}:-`,
        view: v,
        side: null,
        shares: 0,
        avgCost: null,
        price: null,
        valuePts: 0,
        pnlPts: v.realizedPts,
        first: true,
      });
      continue;
    }
    held.forEach(([side, shares, cost], i) => {
      const first = i === 0;
      const valuePts = sideValue(v, side, shares, first);
      rows.push({
        key: `${v.marketId}:${side}`,
        view: v,
        side,
        shares,
        avgCost: v.settled || cost <= 0 ? null : cost / shares,
        price: priceOf(v.market, side),
        valuePts,
        pnlPts: (v.settled ? 0 : valuePts - cost) + (first ? v.realizedPts : 0),
        first,
      });
    });
  }
  return rows;
}
