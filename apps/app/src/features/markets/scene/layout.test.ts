import { describe, expect, it } from 'vitest';
import { createFixtureMarkets } from '../fixtures';
import { isOpen } from '../types';
import { depthFor, layoutMarkets, scaleFor } from './layout';
import { DEPTH, SIZE } from './scene-tokens';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const open = createFixtureMarkets(NOW).filter(isOpen);

describe('layoutMarkets', () => {
  it('encodes time as distance: sooner deadline = nearer the camera (larger z)', () => {
    const placed = layoutMarkets(open, NOW, 16 / 10, 38);
    const byId = new Map(placed.map((p) => [p.id, p]));
    const sorted = [...open].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
    const zs = sorted.map((m) => byId.get(m.id)?.z ?? Number.NaN);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeLessThanOrEqual(zs[i - 1] ?? Number.POSITIVE_INFINITY);
    expect(zs[0]).toBeCloseTo(DEPTH.nearZ, 1); // the settling market (deadline passed) is nearest
    expect(zs.at(-1)).toBeCloseTo(DEPTH.farZ, 5);
  });

  it('encodes collateral as size, within the token range', () => {
    const placed = layoutMarkets(open, NOW, 16 / 10, 38);
    const scale = (id: string) => placed.find((p) => p.id === id)?.scale ?? 0;
    const max = open.reduce((a, b) => (b.collateralSol > a.collateralSol ? b : a));
    const min = open.reduce((a, b) => (b.collateralSol < a.collateralSol ? b : a));
    expect(scale(max.id)).toBeCloseTo(SIZE.max);
    expect(scale(min.id)).toBeCloseTo(SIZE.min);
    for (const p of placed) {
      expect(p.scale).toBeGreaterThanOrEqual(SIZE.min);
      expect(p.scale).toBeLessThanOrEqual(SIZE.max);
    }
  });

  it('gives every market a distinct, finite position on wide and narrow screens', () => {
    for (const aspect of [16 / 9, 390 / 844]) {
      const placed = layoutMarkets(open, NOW, aspect, aspect < 1 ? 52 : 38);
      expect(placed).toHaveLength(open.length);
      const keys = new Set(placed.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`));
      expect(keys.size).toBe(placed.length);
      for (const p of placed) for (const v of [p.x, p.y, p.z, p.scale]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('handles empty input and a single market', () => {
    expect(layoutMarkets([], NOW, 1.6, 38)).toEqual([]);
    const [one] = layoutMarkets(open.slice(0, 1), NOW, 1.6, 38);
    expect(one?.scale).toBeCloseTo((SIZE.min + SIZE.max) / 2);
  });
});

describe('depthFor / scaleFor', () => {
  it('is monotonic and clamped', () => {
    expect(depthFor(0, 100)).toBe(DEPTH.nearZ);
    expect(depthFor(10, 100)).toBeGreaterThan(depthFor(50, 100));
    expect(depthFor(500, 100)).toBe(DEPTH.farZ);
    expect(scaleFor(100, 100, 400)).toBe(SIZE.min);
    expect(scaleFor(400, 100, 400)).toBe(SIZE.max);
  });
});
