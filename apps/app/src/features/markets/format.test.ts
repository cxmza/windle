import { describe, expect, it } from 'vitest';
import { countdown, formatDeadline } from './format';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('format', () => {
  it('countdown ticks in hh:mm:ss with a day prefix and never goes negative', () => {
    expect(countdown(at(3_661_000), NOW)).toBe('01:01:01');
    expect(countdown(at(86_400_000 + 1000), NOW)).toBe('1d 00:00:01');
    expect(countdown(at(-5000), NOW)).toBe('00:00:00');
  });

  it('formatDeadline follows the 12/24-hour clock', () => {
    const iso = '2026-10-12T15:05:00';
    expect(formatDeadline(iso, '24h')).toMatch(/15:05/);
    expect(formatDeadline(iso, '12h')).toMatch(/03:05\s?PM/);
  });
});
