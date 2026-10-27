import { describe, expect, it } from 'vitest';
import { decimalOdds, oddsText, oddsUnit } from './odds';

describe('odds formats', () => {
  it('writes percent as-is and decimal as 100 / p with two places', () => {
    expect(oddsText(62, 'percent')).toBe('62');
    expect(oddsText(62, 'decimal')).toBe('1.61');
    expect(oddsText(50, 'decimal')).toBe('2.00');
    expect(oddsText(3, 'decimal')).toBe('33.33');
  });

  it('has a unit only in percent and a dash for impossible decimal odds', () => {
    expect(oddsUnit('percent')).toBe('%');
    expect(oddsUnit('decimal')).toBe('');
    expect(decimalOdds(0)).toBe('—');
  });
});
