import { describe, expect, it } from 'vitest';
import { createFixtureMarkets } from './fixtures';
import { countdown, deadlineLabel, sidePrice, timeLeft } from './format';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('format', () => {
  it('timeLeft is compact and never negative', () => {
    expect(timeLeft(at((2 * 24 + 4) * 3_600_000 + 5 * 60_000), NOW)).toBe('2d 4h');
    expect(timeLeft(at(5 * 3_600_000 + 7 * 60_000), NOW)).toBe('5h 07m');
    expect(timeLeft(at(14 * 60_000), NOW)).toBe('14m');
    expect(timeLeft(at(-60_000), NOW)).toBe('0m');
  });

  it('countdown ticks in hh:mm:ss with a day prefix', () => {
    expect(countdown(at(3_661_000), NOW)).toBe('01:01:01');
    expect(countdown(at(86_400_000 + 1000), NOW)).toBe('1d 00:00:01');
  });

  it('prices both sides from the ship odds; they sum to 1 SOL', () => {
    const [m] = createFixtureMarkets(NOW);
    if (!m) throw new Error('fixtures empty');
    expect(Number(sidePrice(m, 'ship')) + Number(sidePrice(m, 'slash'))).toBeCloseTo(1);
  });

  it('labels settled and settling markets by status, not by time', () => {
    const markets = createFixtureMarkets(NOW);
    const labels = new Set(markets.filter((m) => m.status !== 'live').map((m) => deadlineLabel(m, NOW)));
    expect(labels).toEqual(new Set(['settling', 'shipped', 'slashed']));
  });
});

describe('fixtures', () => {
  it('are a dozen distinct fictional markets with sane fields', () => {
    const markets = createFixtureMarkets(NOW);
    expect(markets).toHaveLength(12);
    expect(new Set(markets.map((m) => m.id)).size).toBe(12);
    for (const m of markets) {
      expect(m.shipProbability).toBeGreaterThanOrEqual(0);
      expect(m.shipProbability).toBeLessThanOrEqual(100);
      expect(m.collateralSol).toBeGreaterThan(0);
      const passed = Date.parse(m.deadline) <= NOW;
      expect(passed).toBe(m.status !== 'live');
    }
  });
});
