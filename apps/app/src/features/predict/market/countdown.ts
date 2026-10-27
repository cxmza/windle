import type { ApiMarket } from '@windle/shared';
import { presetOfMarket, type RiskTone } from '../ui/risk';

const DAY_MS = 86_400_000;

const two = (n: number): string => String(n).padStart(2, '0');

/** `01:07:12` under a day, `3d 4h` from a day up. Never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total * 1000 >= DAY_MS) {
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3600);
    return `${days}d ${hours}h`;
  }
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

export type ChipState =
  | { kind: 'counting'; label: string; remainingMs: number; tone: RiskTone }
  | { kind: 'ended'; label: string; text: string; tone: RiskTone };

const ENDED_TEXT: Record<Exclude<ApiMarket['status'], 'open'>, string> = {
  closed: 'Closed',
  proposed: 'Closed',
  disputed: 'Closed',
  resolved: 'Resolved',
  voided: 'Voided',
};

/** What the chip beside the price shows: the preset and a live countdown while trading, a plain state afterwards. */
export function chipState(market: ApiMarket, now: number): ChipState {
  const preset = presetOfMarket(market);
  const label = preset ? preset.label.toUpperCase() : 'CUSTOM';
  const remainingMs = Date.parse(market.deadline) - now;
  if (market.status === 'open') {
    return remainingMs > 0
      ? { kind: 'counting', label, remainingMs, tone: preset?.risk ?? 'custom' }
      : { kind: 'ended', label, text: 'Closing', tone: preset?.risk ?? 'custom' };
  }
  return { kind: 'ended', label, text: ENDED_TEXT[market.status], tone: 'custom' };
}
