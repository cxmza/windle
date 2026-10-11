import type { Market } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeLeft(deadlineIso: string, now: number): string {
  const ms = Math.max(0, Date.parse(deadlineIso) - now);
  if (ms >= DAY) {
    const d = Math.floor(ms / DAY);
    const h = Math.floor((ms % DAY) / HOUR);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  if (ms >= HOUR) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MINUTE);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${Math.floor(ms / MINUTE)}m`;
}

export function countdown(deadlineIso: string, now: number): string {
  const s = Math.max(0, Math.floor((Date.parse(deadlineIso) - now) / 1000));
  const d = Math.floor(s / 86_400);
  const hms = [Math.floor((s % 86_400) / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return d ? `${d}d ${hms}` : hms;
}

const sol = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
export const formatSol = (n: number): string => `${sol.format(n)} SOL`;

export function sidePrice(m: Market, side: 'ship' | 'slash'): string {
  const p = side === 'ship' ? m.shipProbability : 100 - m.shipProbability;
  return (p / 100).toFixed(2);
}

const deadlineFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export const formatDeadline = (iso: string): string => deadlineFmt.format(new Date(iso));

export function deadlineLabel(m: Market, now: number): string {
  switch (m.status) {
    case 'settling':
      return 'settling';
    case 'shipped':
      return 'shipped';
    case 'slashed':
      return 'slashed';
    default:
      return timeLeft(m.deadline, now);
  }
}
