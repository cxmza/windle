import { describe, expect, it } from 'vitest';
import { formatCompact, formatDate, formatDateTime } from './format';

const year = new Date().getFullYear();

describe('formatDateTime', () => {
  it('omits the year in the current year and shows it otherwise', () => {
    expect(formatDateTime(new Date(year, 9, 11, 13, 25).toISOString(), '24h')).toBe('Oct 11, 13:25');
    expect(formatDateTime(new Date(year - 1, 9, 11, 13, 25).toISOString(), '24h')).toBe(`Oct 11, ${year - 1}, 13:25`);
  });

  it('follows the 12-hour clock', () => {
    expect(formatDateTime(new Date(year, 9, 11, 15, 5).toISOString(), '12h')).toMatch(/03:05\s?PM$/);
  });

  it('formats dates the same way', () => {
    expect(formatDate(new Date(year, 9, 11).toISOString())).toBe('Oct 11');
    expect(formatDate(new Date(year - 1, 9, 11).toISOString())).toBe(`Oct 11, ${year - 1}`);
  });
});

describe('formatCompact', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1_000, '1K'],
    [1_234, '1.2K'],
    [34_567, '34.5K'],
    [999_999, '999K'],
    [1_000_000, '1M'],
    [3_400_000, '3.4M'],
    [120_000_000, '120M'],
    [2_500_000_000, '2.5B'],
  ])('%i -> %s', (n, text) => {
    expect(formatCompact(n)).toBe(text);
  });
});
