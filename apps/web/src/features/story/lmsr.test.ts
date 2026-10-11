import { describe, expect, it } from 'vitest';
import { inventoryForPrice, lmsrCost, lmsrPriceYes, sharesForStake } from './lmsr';

const B = 50;

describe('lmsr', () => {
  it('prices an empty book at 50/50', () => {
    expect(lmsrPriceYes({ yes: 0, no: 0 }, B)).toBeCloseTo(0.5, 10);
  });

  it('opens at the requested probability', () => {
    const q = inventoryForPrice(0.72, B);
    expect(lmsrPriceYes(q, B)).toBeCloseTo(0.72, 10);
  });

  it('charges exactly the stake for the shares it returns (cost difference = stake)', () => {
    const q = inventoryForPrice(0.72, B);
    for (const side of ['yes', 'no'] as const) {
      const shares = sharesForStake(q, side, 10, B);
      const after = side === 'yes' ? { yes: q.yes + shares, no: q.no } : { yes: q.yes, no: q.no + shares };
      expect(lmsrCost(after, B) - lmsrCost(q, B)).toBeCloseTo(10, 8);
    }
  });

  it('moves the price toward the side that was bought, and stays finite when pushed hard', () => {
    let q = inventoryForPrice(0.72, B);
    const start = lmsrPriceYes(q, B);
    q = { yes: q.yes + sharesForStake(q, 'yes', 10, B), no: q.no };
    expect(lmsrPriceYes(q, B)).toBeGreaterThan(start);
    for (let i = 0; i < 200; i++) q = { yes: q.yes + sharesForStake(q, 'yes', 10, B), no: q.no };
    const p = lmsrPriceYes(q, B);
    expect(p).toBeLessThanOrEqual(1);
    expect(Number.isFinite(p)).toBe(true);
  });

  it('gives fewer shares per unit as the price rises (slippage)', () => {
    const q = inventoryForPrice(0.72, B);
    const first = sharesForStake(q, 'yes', 10, B);
    const second = sharesForStake({ yes: q.yes + first, no: q.no }, 'yes', 10, B);
    expect(second).toBeLessThan(first);
  });

  it('returns 0 shares for a non-positive stake', () => {
    expect(sharesForStake({ yes: 0, no: 0 }, 'yes', 0, B)).toBe(0);
    expect(sharesForStake({ yes: 0, no: 0 }, 'no', -5, B)).toBe(0);
  });
});
