import { describe, expect, it } from 'vitest';
import { formatAbsolute, formatAge, formatAgo, formatDuration, formatPostTime, formatRemaining } from './time';

const NOW = Date.parse('2026-10-13T12:00:00.000Z');
const ago = (ms: number) => NOW - ms;

describe('formatAge', () => {
  it.each([
    [-5_000, 'now'],
    [400, 'now'],
    [1_000, '1s'],
    [12_900, '12s'],
    [59_999, '59s'],
    [60_000, '1m'],
    [4 * 60_000 + 59_000, '4m'],
    [59 * 60_000 + 59_000, '59m'],
    [3 * 3_600_000, '3h'],
    [23 * 3_600_000 + 3_599_000, '23h'],
  ])('%i ms -> %s', (ms, text) => {
    expect(formatAge(ms)).toBe(text);
  });
});

describe('formatPostTime', () => {
  it('is relative for the first day', () => {
    expect(formatPostTime(ago(12_000), NOW, 'UTC')).toBe('12s');
    expect(formatPostTime(ago(4 * 60_000), NOW, 'UTC')).toBe('4m');
    expect(formatPostTime(ago(3 * 3_600_000), NOW, 'UTC')).toBe('3h');
  });

  it('is the short date within this year and carries the year after that', () => {
    expect(formatPostTime(Date.parse('2026-10-12T08:00:00Z'), NOW, 'UTC')).toBe('Oct 12');
    expect(formatPostTime(Date.parse('2026-02-03T08:00:00Z'), NOW, 'UTC')).toBe('Feb 3');
    expect(formatPostTime(Date.parse('2025-10-12T08:00:00Z'), NOW, 'UTC')).toBe('Oct 12, 2025');
  });
});

describe('formatAgo', () => {
  it('writes ago under a day, and the date after', () => {
    expect(formatAgo(ago(2_000), NOW, 'UTC')).toBe('just now');
    expect(formatAgo(ago(12_000), NOW, 'UTC')).toBe('12s ago');
    expect(formatAgo(ago(5 * 3_600_000), NOW, 'UTC')).toBe('5h ago');
    expect(formatAgo(Date.parse('2026-10-01T00:00:00Z'), NOW, 'UTC')).toBe('Oct 1');
  });
});

describe('formatAbsolute', () => {
  const at = Date.parse('2026-10-12T14:05:09Z');
  it('shows seconds, the date and the year in 24-hour time', () => {
    expect(formatAbsolute(at, '24h', 'UTC')).toBe('14:05:09 · Oct 12, 2026');
  });
  it('follows the 12-hour choice', () => {
    expect(formatAbsolute(at, '12h', 'UTC')).toBe('02:05:09 PM · Oct 12, 2026');
  });
  it('uses the given time zone', () => {
    expect(formatAbsolute(at, '24h', 'Asia/Tokyo')).toBe('23:05:09 · Oct 12, 2026');
  });
});

describe('formatRemaining / formatDuration', () => {
  it('keeps the two leading units of a countdown', () => {
    expect(formatRemaining(3 * 3_600_000 + 12 * 60_000 + 5_000)).toBe('3h 12m');
    expect(formatRemaining(2 * 86_400_000)).toBe('2d');
    expect(formatRemaining(12 * 60_000 + 30_000)).toBe('12m 30s');
    expect(formatRemaining(-5)).toBe('0s');
  });
  it('writes video length', () => {
    expect(formatDuration(42_000)).toBe('0:42');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
