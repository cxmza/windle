export type MarketStatus = 'live' | 'settling' | 'shipped' | 'slashed';

export interface Market {
  id: string;
  team: string;
  ticker: string;
  promise: string;
  check: string;
  shipProbability: number;
  collateralSol: number;
  deadline: string;
  status: MarketStatus;
}

export const isOpen = (m: Market): boolean => m.status === 'live' || m.status === 'settling';
