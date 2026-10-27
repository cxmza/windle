import {
  CANDLE_TIMEFRAME_SECONDS,
  CANDLE_TIMEFRAMES,
  type Candle,
  type CandleTimeframe,
  type Market,
} from '@windle/shared';

export type ChartKind = 'candles' | 'line';

/** The default timeframe is the finest one that still draws no more than this many candles. */
export const TARGET_MAX_CANDLES = 200;

const MIN_SPAN_PP = 10;

export const TIMEFRAME_OPTIONS = CANDLE_TIMEFRAMES.map((tf) => ({ value: tf, label: tf }));

export function defaultTimeframe(ageMs: number): CandleTimeframe {
  const seconds = Math.max(0, ageMs) / 1000;
  return CANDLE_TIMEFRAMES.find((tf) => seconds / CANDLE_TIMEFRAME_SECONDS[tf] <= TARGET_MAX_CANDLES) ?? '1d';
}

/** How long the market has traded: to now while open, to its close or resolution afterwards. */
export function marketAgeMs(
  market: Pick<Market, 'status' | 'createdAt' | 'deadline' | 'resolution'>,
  now: number,
): number {
  const created = Date.parse(market.createdAt);
  if (market.status === 'open') return now - created;
  const ended = Date.parse(market.resolution?.resolvedAt ?? market.deadline);
  return Math.min(now, ended) - created;
}

const percent = (p: number): number => Math.round(p * 10_000) / 100;

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export type VolumeTone = 'up' | 'down' | 'bot';

export interface VolumeBar {
  time: number;
  value: number;
  tone: VolumeTone;
}

export const toCandleData = (candles: readonly Candle[]): CandlePoint[] =>
  candles.map((c) => ({ time: c.t, open: percent(c.o), high: percent(c.h), low: percent(c.l), close: percent(c.c) }));

export const toLineData = (candles: readonly Candle[]): LinePoint[] =>
  candles.map((c) => ({ time: c.t, value: percent(c.c) }));

/**
 * Two overlapping bars per candle: the whole volume in the bot tone behind, the human part on top in the direction of
 * the candle. What shows above the human bar is the bots' share.
 */
export function toVolumeData(candles: readonly Candle[]): { total: VolumeBar[]; human: VolumeBar[] } {
  return {
    total: candles.map((c) => ({ time: c.t, value: c.v, tone: 'bot' as const })),
    human: candles.map((c) => ({
      time: c.t,
      value: Math.max(0, c.v - c.vBot),
      tone: c.c >= c.o ? ('up' as const) : ('down' as const),
    })),
  };
}

export const hasTrades = (candles: readonly Candle[]): boolean => candles.some((c) => c.n > 0);

export interface CandleSummary {
  open: number;
  high: number;
  low: number;
  close: number;
  changePp: number;
}

const tenth = (n: number): number => Math.round(n * 10) / 10;

/** One candle as the legend line shows it: percentages to a tenth and the move from open to close. */
export function summarize(candle: Candle): CandleSummary {
  return {
    open: tenth(candle.o * 100),
    high: tenth(candle.h * 100),
    low: tenth(candle.l * 100),
    close: tenth(candle.c * 100),
    changePp: tenth((candle.c - candle.o) * 100),
  };
}

export function candleAt(candles: readonly Candle[], time: number | null): Candle | null {
  const last = candles[candles.length - 1] ?? null;
  if (time === null) return last;
  return candles.find((c) => c.t === time) ?? last;
}

/** A price axis never collapses onto a flat line: at least MIN_SPAN_PP wide, kept inside 0-100. */
export function paddedRange(min: number, max: number): { min: number; max: number } {
  if (max - min >= MIN_SPAN_PP) return { min, max };
  const mid = (min + max) / 2;
  let low = mid - MIN_SPAN_PP / 2;
  let high = mid + MIN_SPAN_PP / 2;
  if (low < 0) {
    high -= low;
    low = 0;
  }
  if (high > 100) {
    low -= high - 100;
    high = 100;
  }
  return { min: Math.max(0, low), max: Math.min(100, high) };
}
