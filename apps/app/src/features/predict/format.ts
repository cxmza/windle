const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const fine = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const MINUS = '\u2212';
const isZero = (n: number): boolean => Math.abs(n) < 0.005;

export const formatPts = (n: number): string => fine.format(isZero(n) ? 0 : n);

export const formatPtsWhole = (n: number): string => whole.format(n);

export const formatCompactPts = (n: number): string => (n < 1000 ? whole.format(n) : compact.format(n));

export function formatSignedPts(n: number): string {
  if (isZero(n)) return '0';
  return `${n > 0 ? '+' : MINUS}${fine.format(Math.abs(n))}`;
}

export const formatShares = (n: number): string => fine.format(n);

export const formatPrice = (p: number): string => p.toFixed(2);

export type Sign = 'gain' | 'loss' | 'flat';

export const signOf = (n: number): Sign => (isZero(n) ? 'flat' : n > 0 ? 'gain' : 'loss');

export const SIGN_CLASS: Record<Sign, string> = {
  gain: 'text-(--gain)',
  loss: 'text-(--loss)',
  flat: 'text-muted-foreground',
};

export const probToPercent = (p: number): number => Math.round(p * 100);

/** Plain-text unit for strings that cannot hold the coin icon (aria labels, document titles, validation copy). */
export const PTS_TEXT = 'practice points';

export const formatPtsUnit = (n: number): string => `${formatPts(n)} ${PTS_TEXT}`;

export const formatSolUnit = (n: number): string => `${fine.format(n)} SOL`;

export const formatSignedPp = (n: number): string => `${formatSignedPts(n)} pp`;
