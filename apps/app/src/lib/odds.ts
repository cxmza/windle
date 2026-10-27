import type { OddsFormat } from '@/features/settings/prefs';

/** Decimal odds of a probability given in percent: 62 -> "1.61". Undefined at 0, shown as a dash. */
export const decimalOdds = (percent: number): string => (percent > 0 ? (100 / percent).toFixed(2) : '—');

export const oddsText = (percent: number, format: OddsFormat): string =>
  format === 'decimal' ? decimalOdds(percent) : String(percent);

export const oddsUnit = (format: OddsFormat): string => (format === 'percent' ? '%' : '');
