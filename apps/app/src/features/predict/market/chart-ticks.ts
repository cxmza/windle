import type { CandleTimeframe } from '@windle/shared';
import type { ClockFormat } from '@/features/settings/prefs';

export type TickKind = 'year' | 'month' | 'day' | 'time';

const cycle = (clock: ClockFormat) => (clock === '24h' ? 'h23' : 'h12');

const formats = (clock: ClockFormat) => ({
  time: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: cycle(clock) }),
  day: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }),
  month: new Intl.DateTimeFormat('en', { month: 'short' }),
  year: new Intl.DateTimeFormat('en', { year: 'numeric' }),
  full: new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: cycle(clock),
  }),
});

const DAILY: readonly CandleTimeframe[] = ['1d'];

/** The crosshair's time: always the date and the time of the candle, never seconds (candles are minute-aligned). */
export function formatCrosshairTime(seconds: number, tf: CandleTimeframe, clock: ClockFormat): string {
  const f = formats(clock);
  const d = new Date(seconds * 1000);
  return DAILY.includes(tf) ? f.day.format(d) : f.full.format(d);
}

/**
 * Axis labels for one render. The chart may ask for more ticks than a window has distinct labels, so a label already
 * shown for another instant is blanked rather than repeated. A call that goes back in time starts a new layout pass.
 * Seconds never appear: the finest candle is a minute.
 */
export function createTickFormatter(
  tf: CandleTimeframe,
  clock: ClockFormat,
): (seconds: number, kind: TickKind) => string {
  const f = formats(clock);
  const seen = new Map<string, number>();
  let previous = Number.NEGATIVE_INFINITY;
  return (seconds, kind) => {
    if (seconds <= previous) seen.clear();
    previous = seconds;
    const d = new Date(seconds * 1000);
    let label: string;
    if (kind === 'year') label = f.year.format(d);
    else if (kind === 'month') label = f.month.format(d);
    else if (kind === 'day' || DAILY.includes(tf)) label = f.day.format(d);
    else label = f.time.format(d);
    const owner = seen.get(label);
    if (owner !== undefined && owner !== seconds) return '';
    seen.set(label, seconds);
    return label;
  };
}
