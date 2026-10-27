import { describe, expect, it } from 'vitest';
import { createTickFormatter, formatCrosshairTime } from './chart-ticks';

const base = Math.floor(Date.parse('2026-10-17T01:04:10Z') / 1000);

describe('createTickFormatter', () => {
  it('never repeats a label for different instants within one pass', () => {
    const fmt = createTickFormatter('5m', '24h');
    const first = fmt(base, 'time');
    expect(first).not.toBe('');
    expect(fmt(base + 20, 'time')).toBe('');
    expect(fmt(base + 600, 'time')).not.toBe('');
  });

  it('answers the same instant the same way, so a redraw does not change labels', () => {
    const fmt = createTickFormatter('15m', '24h');
    const label = fmt(base, 'time');
    expect(fmt(base, 'time')).toBe(label);
  });

  it('starts a fresh layout pass when asked to go back in time', () => {
    const fmt = createTickFormatter('15m', '24h');
    const label = fmt(base, 'time');
    fmt(base + 600, 'time');
    expect(fmt(base, 'time')).toBe(label);
  });

  it('never shows seconds, even on the finest timeframe', () => {
    const fmt = createTickFormatter('1m', '24h');
    expect(fmt(base, 'time')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('follows the 12/24 hour preference', () => {
    expect(createTickFormatter('1h', '12h')(base, 'time')).toMatch(/AM|PM/);
    expect(createTickFormatter('1h', '24h')(base, 'time')).not.toMatch(/AM|PM/);
  });

  it('labels daily candles with dates and formats day, month and year ticks', () => {
    expect(createTickFormatter('1d', '24h')(base, 'time')).toMatch(/Oct 1[67]/);
    const fmt = createTickFormatter('4h', '24h');
    expect(fmt(base, 'day')).toMatch(/Oct 1[67]/);
    expect(fmt(base + 1, 'month')).toBe('Oct');
    expect(fmt(base + 2, 'year')).toBe('2026');
  });
});

describe('formatCrosshairTime', () => {
  it('shows date and time without seconds, and only the date for daily candles', () => {
    expect(formatCrosshairTime(base, '5m', '24h')).toMatch(/Oct 1[67].*\d{2}:\d{2}$/);
    expect(formatCrosshairTime(base, '5m', '24h')).not.toMatch(/:\d{2}:\d{2}/);
    expect(formatCrosshairTime(base, '1d', '24h')).toMatch(/^Oct 1[67]$/);
  });
});
