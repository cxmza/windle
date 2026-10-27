import type { ApiMarket, ApiPortfolio, ApiPosition, ApiTrade } from '@windle/shared';

export interface PositionView extends ApiPosition {
  market: ApiMarket;
  settled: boolean;
  unrealizedPts: number;
}

export interface PortfolioView {
  balancePts: number;
  startingBalancePts: number;
  positions: PositionView[];
  markets: readonly ApiMarket[];
  history: readonly ApiTrade[];
  positionsValuePts: number;
  equityPts: number;
  realizedPts: number;
  unrealizedPts: number;
  pnlPts: number;
  paidOutPts: number;
  rank: number | null;
}

export function buildPortfolio(api: ApiPortfolio): PortfolioView {
  const byId = new Map(api.markets.map((m) => [m.id, m]));
  const positions: PositionView[] = [];
  for (const p of api.positions) {
    const market = byId.get(p.marketId);
    if (!market) continue;
    const settled = p.settledAt !== null;
    positions.push({ ...p, market, settled, unrealizedPts: settled ? 0 : p.valuePts - p.costBasisPts });
  }
  return {
    balancePts: api.balancePts,
    startingBalancePts: api.startingBalancePts,
    positions,
    markets: api.markets,
    history: api.history,
    positionsValuePts: api.openValuePts,
    equityPts: api.netWorthPts,
    realizedPts: positions.reduce((a, p) => a + p.realizedPts, 0),
    unrealizedPts: positions.reduce((a, p) => a + p.unrealizedPts, 0),
    pnlPts: api.pnlPts,
    paidOutPts: positions.reduce((a, p) => a + (p.payoutPts ?? 0), 0),
    rank: api.rank,
  };
}
