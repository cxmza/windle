import type { ClockFormat } from '@/features/settings/prefs';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, options: Intl.DateTimeFormatOptions, timeZone?: string): Intl.DateTimeFormat {
  const k = `${key}|${timeZone ?? ''}`;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('en', timeZone ? { ...options, timeZone } : options);
    fmtCache.set(k, f);
  }
  return f;
}

const yearOf = (ms: number, timeZone?: string): string =>
  fmt('year', { year: 'numeric' }, timeZone).format(new Date(ms));

/** `now`, `12s`, `4m`, `3h`: the age of a post in the fewest characters, from a clock already corrected for skew. */
export function formatAge(ageMs: number): string {
  const s = Math.floor(Math.max(0, ageMs) / SECOND);
  if (s < 1) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/** Like X: relative under a day, then `Oct 12`, and `Oct 12, 2025` once the year is not the current one. */
export function formatPostTime(createdMs: number, nowMs: number, timeZone?: string): string {
  if (nowMs - createdMs < DAY) return formatAge(nowMs - createdMs);
  const sameYear = yearOf(createdMs, timeZone) === yearOf(nowMs, timeZone);
  const f = sameYear
    ? fmt('md', { month: 'short', day: 'numeric' }, timeZone)
    : fmt('mdy', { month: 'short', day: 'numeric', year: 'numeric' }, timeZone);
  return f.format(new Date(createdMs));
}

/** `12s ago`, `4m ago`, `3h ago`, then the short date. */
export function formatAgo(createdMs: number, nowMs: number, timeZone?: string): string {
  const age = nowMs - createdMs;
  if (age < 5 * SECOND) return 'just now';
  const text = formatPostTime(createdMs, nowMs, timeZone);
  return age < DAY ? `${text} ago` : text;
}

/** `12:34:56 · Oct 12, 2026` in the viewer's time zone, 12 or 24-hour as chosen in settings. */
export function formatAbsolute(ms: number, clock: ClockFormat, timeZone?: string): string {
  const d = new Date(ms);
  const time = fmt(
    `t${clock}`,
    { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: clock === '12h' ? 'h12' : 'h23' },
    timeZone,
  ).format(d);
  const date = fmt('dmy', { month: 'short', day: 'numeric', year: 'numeric' }, timeZone).format(d);
  return `${time} · ${date}`;
}

/** `2d 4h`, `3h 12m`, `12m 30s`, `45s`: a countdown with its two leading units. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / SECOND));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** `0:42`, `1:05:09`: the length of a video. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / SECOND));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
