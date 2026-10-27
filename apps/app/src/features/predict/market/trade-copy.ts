import type { ApiMarket } from '@windle/shared';
import { formatPtsUnit, formatShares } from '../format';
import type { QuoteProblem } from '../trading';
import { outcomeLabel, sideLabel } from './market-view';

export type Tab = 'buy' | 'sell';

export const BUY_CHIPS = [10, 50, 100, 500] as const;

export function parseAmount(raw: string): number {
  const text = raw.trim().replace(',', '.');
  if (text === '') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

export function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  const first = cleaned.search(/[.,]/);
  if (first < 0) return cleaned;
  return cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/[.,]/g, '');
}

export function floorTo(n: number, digits: number): number {
  const k = 10 ** digits;
  return Math.floor(n * k + 1e-9) / k;
}

interface ProblemContext {
  tab: Tab;
  market: ApiMarket;
  side: 'yes' | 'no';
  balancePts: number;
  owned: number;
}

export function problemText(problem: QuoteProblem, ctx: ProblemContext): string {
  switch (problem) {
    case 'invalid_amount':
      return ctx.tab === 'buy' ? 'Enter at least 1 practice point.' : 'Enter a number of shares greater than 0.';
    case 'insufficient_balance':
      return `You have ${formatPtsUnit(ctx.balancePts)}. Lower the amount or use Max.`;
    case 'insufficient_shares':
      return ctx.owned > 0
        ? `You hold ${formatShares(ctx.owned)} ${sideLabel(ctx.market, ctx.side)} shares. Lower the amount or use Max.`
        : `You hold no ${sideLabel(ctx.market, ctx.side)} shares to sell.`;
  }
}

export function closedReason(market: ApiMarket): string | null {
  switch (market.status) {
    case 'open':
      return null;
    case 'closed':
      return market.viewer?.canResolve
        ? 'Trading closed at the deadline. Decide the outcome in the Resolution tab below.'
        : 'Trading closed at the deadline. Waiting for the creator to resolve the market.';
    case 'proposed':
      return 'Trading is closed while the proposed outcome sits in its dispute window.';
    case 'disputed':
      return 'Trading is closed while a dispute is reviewed.';
    case 'resolved': {
      const final = market.resolution?.finalOutcome;
      return `Resolved${final ? `: ${outcomeLabel(market, final)}` : ''}. Winning positions were paid out automatically.`;
    }
    case 'voided':
      return 'This market was voided. Every position was refunded at cost.';
  }
}
