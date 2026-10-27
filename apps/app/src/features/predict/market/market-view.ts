import { type Market, type MarketSide, type ProposedOutcome, SIDE_LABELS } from '@windle/shared';

export const sideLabel = (m: Pick<Market, 'tier'>, side: MarketSide): string => SIDE_LABELS[m.tier][side];

export const toSidePrice = (probYes: number, side: MarketSide): number => (side === 'yes' ? probYes : 1 - probYes);

export function outcomeLabel(m: Pick<Market, 'tier'>, outcome: ProposedOutcome): string {
  return outcome === 'void' ? 'Void' : sideLabel(m, outcome);
}

export const shortMint = (mint: string): string => `${mint.slice(0, 4)}…${mint.slice(-4)}`;
