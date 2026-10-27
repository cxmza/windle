import { type ClockFormat, getPrefs } from '@/features/settings/prefs';
import { formatDateTime } from '@/lib/format';

export function countdown(deadlineIso: string, now: number): string {
  const s = Math.max(0, Math.floor((Date.parse(deadlineIso) - now) / 1000));
  const d = Math.floor(s / 86_400);
  const hms = [Math.floor((s % 86_400) / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return d ? `${d}d ${hms}` : hms;
}

export const formatDeadline = (iso: string, clock: ClockFormat = getPrefs().clock): string =>
  formatDateTime(iso, clock);
