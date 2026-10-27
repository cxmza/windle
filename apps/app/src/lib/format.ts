import { type ClockFormat, getPrefs } from '@/features/settings/prefs';

/** `9WzDXw…tAWWM`: enough to recognise an address without letting it blow out a 360px layout. */
export function shortAddress(address: string, head = 4, tail = 4): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const dateTimeFmt = (clock: ClockFormat, year: boolean) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: clock === '12h' ? 'h12' : 'h23',
  });
const dateTime: Record<ClockFormat, { current: Intl.DateTimeFormat; other: Intl.DateTimeFormat }> = {
  '24h': { current: dateTimeFmt('24h', false), other: dateTimeFmt('24h', true) },
  '12h': { current: dateTimeFmt('12h', false), other: dateTimeFmt('12h', true) },
};
const dateFmt = {
  current: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }),
  other: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }),
};

const isCurrentYear = (d: Date): boolean => d.getFullYear() === new Date().getFullYear();

/** `Oct 11, 13:25`; the year appears only when it is not the current one. Follows the 12/24-hour preference. */
export function formatDateTime(iso: string, clock: ClockFormat = getPrefs().clock): string {
  const d = new Date(iso);
  return dateTime[clock][isCurrentYear(d) ? 'current' : 'other'].format(d);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return dateFmt[isCurrentYear(d) ? 'current' : 'other'].format(d);
}

const COMPACT = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
] as const;

/** `999`, `1.2K`, `34K`, `3.4M`: engagement counts the way X writes them (truncated, never rounded up a unit). */
export function formatCompact(n: number): string {
  for (const [size, suffix] of COMPACT) {
    if (n >= size) {
      const v = Math.floor((n / size) * 10) / 10;
      return `${v >= 100 ? Math.floor(v) : v}${suffix}`;
    }
  }
  return String(n);
}

export const formatExact = (n: number): string => new Intl.NumberFormat('en').format(n);
