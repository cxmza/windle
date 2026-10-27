import { z } from '../zod.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How far ahead a market may close, for a custom deadline and for every preset alike. */
export const MARKET_MIN_DURATION_MS = 15 * MINUTE_MS;
export const MARKET_MAX_DURATION_MS = 366 * DAY_MS;

export const DURATION_PRESET_IDS = ['flash', 'fast', 'slow', 'day', 'week', 'month'] as const;
export const DurationPresetId = z.enum(DURATION_PRESET_IDS);
export type DurationPresetId = z.infer<typeof DurationPresetId>;

/** From the trader's side: the shorter the market, the more a single trade or a late tweet swings it. */
export const DURATION_RISKS = ['extreme', 'high', 'medium', 'standard', 'low'] as const;
export const DurationRisk = z.enum(DURATION_RISKS);
export type DurationRisk = z.infer<typeof DurationRisk>;

export interface DurationPreset {
  id: DurationPresetId;
  /** Display name, e.g. "Flash". */
  label: string;
  /** Compact duration, e.g. "15m". */
  short: string;
  ms: number;
  risk: DurationRisk;
  recommended?: boolean;
}

/** Create-wizard durations, shortest first. With `durationPreset` the server closes the market at now + `ms`. */
export const DURATION_PRESETS: readonly DurationPreset[] = [
  { id: 'flash', label: 'Flash', short: '15m', ms: 15 * MINUTE_MS, risk: 'extreme' },
  { id: 'fast', label: 'Fast', short: '1h', ms: HOUR_MS, risk: 'high' },
  { id: 'slow', label: 'Slow', short: '4h', ms: 4 * HOUR_MS, risk: 'medium' },
  { id: 'day', label: 'Day', short: '24h', ms: DAY_MS, risk: 'standard', recommended: true },
  { id: 'week', label: 'Week', short: '7d', ms: 7 * DAY_MS, risk: 'low' },
  { id: 'month', label: 'Month', short: '30d', ms: 30 * DAY_MS, risk: 'low' },
];

export function durationPresetOf(id: DurationPresetId): DurationPreset {
  const preset = DURATION_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`unknown duration preset ${id}`);
  return preset;
}
