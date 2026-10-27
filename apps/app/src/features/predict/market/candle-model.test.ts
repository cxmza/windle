import type { Candle } from '@windle/shared';
import { describe, expect, it } from 'vitest';
import {
  candleAt,
  defaultTimeframe,
  hasTrades,
  marketAgeMs,
  paddedRange,
  summarize,
  TARGET_MAX_CANDLES,
  toCandleData,
  toLineData,
  toVolumeData,
} from './candle-model';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const candle = (over: Partial<Candle> = {}): Candle => ({
  t: 1_000,
  o: 0.5,
  h: 0.5,
  l: 0.5,
  c: 0.5,
  v: 0,
  vBot: 0,
  n: 0,
  nBot: 0,
  ...over,
});

describe('defaultTimeframe', () => {
  it.each([
    [0, '1m'],
    [3 * MIN, '1m'],
    [3 * HOUR, '1m'],
    [4 * HOUR, '5m'],
    [DAY, '15m'],
    [5 * DAY, '1h'],
    [30 * DAY, '4h'],
    [400 * DAY, '1d'],
  ])('picks the finest timeframe that shows no more than the target for age %i ms -> %s', (age, tf) => {
    expect(defaultTimeframe(age)).toBe(tf);
  });

  it('never draws more than the target candles unless even a day is too fine', () => {
    for (const age of [HOUR, 6 * HOUR, DAY, 3 * DAY, 20 * DAY, 90 * DAY]) {
      const tf = defaultTimeframe(age);
      const seconds = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14_400, '1d': 86_400 }[tf];
      expect(age / 1000 / seconds).toBeLessThanOrEqual(TARGET_MAX_CANDLES);
    }
  });
});

describe('marketAgeMs', () => {
  const base = { createdAt: new Date(10 * DAY).toISOString(), deadline: new Date(12 * DAY).toISOString() };
  it('runs to now while the market is open', () => {
    expect(marketAgeMs({ ...base, status: 'open' }, 11 * DAY)).toBe(DAY);
  });
  it('stops at the deadline once trading closed', () => {
    expect(marketAgeMs({ ...base, status: 'closed' }, 50 * DAY)).toBe(2 * DAY);
  });
});

describe('chart data', () => {
  it('maps probabilities to percent for candles and the line', () => {
    const c = candle({ t: 60, o: 0.5, h: 0.64, l: 0.49, c: 0.6234 });
    expect(toCandleData([c])).toEqual([{ time: 60, open: 50, high: 64, low: 49, close: 62.34 }]);
    expect(toLineData([c])).toEqual([{ time: 60, value: 62.34 }]);
  });

  it('draws the whole volume in the bot tone behind a human part tinted by the candle direction', () => {
    const up = candle({ t: 1, o: 0.5, c: 0.55, v: 10, vBot: 4 });
    const down = candle({ t: 2, o: 0.55, c: 0.5, v: 6, vBot: 6 });
    const flat = candle({ t: 3 });
    const { total, human } = toVolumeData([up, down, flat]);
    expect(total.map((b) => b.tone)).toEqual(['bot', 'bot', 'bot']);
    expect(total.map((b) => b.value)).toEqual([10, 6, 0]);
    expect(human.map((b) => b.value)).toEqual([6, 0, 0]);
    expect(human.map((b) => b.tone)).toEqual(['up', 'down', 'up']);
  });

  it('never lets rounding push the human volume below zero', () => {
    expect(toVolumeData([candle({ v: 1, vBot: 1.0000001 })]).human[0]?.value).toBe(0);
  });
});

describe('legend', () => {
  it('summarizes a candle to a tenth of a percent with the move from open to close', () => {
    expect(summarize(candle({ o: 0.5, h: 0.64, l: 0.49, c: 0.6234 }))).toEqual({
      open: 50,
      high: 64,
      low: 49,
      close: 62.3,
      changePp: 12.3,
    });
  });

  it('finds the hovered candle and falls back to the latest', () => {
    const list = [candle({ t: 1 }), candle({ t: 2, c: 0.7 })];
    expect(candleAt(list, 1)?.t).toBe(1);
    expect(candleAt(list, null)?.t).toBe(2);
    expect(candleAt(list, 99)?.t).toBe(2);
    expect(candleAt([], null)).toBeNull();
  });

  it('knows whether anything traded', () => {
    expect(hasTrades([candle(), candle()])).toBe(false);
    expect(hasTrades([candle(), candle({ n: 1 })])).toBe(true);
  });
});

describe('paddedRange', () => {
  it('leaves a wide range alone', () => {
    expect(paddedRange(20, 60)).toEqual({ min: 20, max: 60 });
  });
  it('widens a flat range around its middle', () => {
    expect(paddedRange(50, 50)).toEqual({ min: 45, max: 55 });
  });
  it('keeps the widened range inside 0-100', () => {
    expect(paddedRange(1, 1)).toEqual({ min: 0, max: 10 });
    expect(paddedRange(99, 99)).toEqual({ min: 90, max: 100 });
  });
});
