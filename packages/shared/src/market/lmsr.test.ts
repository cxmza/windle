import { describe, expect, it } from 'vitest';
import {
  inventoryForPrice,
  lmsrCost,
  lmsrPriceYes,
  proceedsForShares,
  quote,
  quoteSell,
  sharesForStake,
  withShares,
} from './lmsr.ts';

const B = 50;

describe('lmsr', () => {
  it('prices an empty book at 50/50', () => {
    expect(lmsrPriceYes({ yes: 0, no: 0 }, B)).toBeCloseTo(0.5, 10);
  });

  it('opens at the requested probability on either side of 50%', () => {
    for (const p of [0.05, 0.3, 0.5, 0.72, 0.95]) {
      expect(lmsrPriceYes(inventoryForPrice(p, B), B)).toBeCloseTo(p, 10);
    }
    const low = inventoryForPrice(0.2, B);
    expect(low.yes).toBe(0);
    expect(low.no).toBeGreaterThan(0);
  });

  it('matches the documented example: b=50 at 0.72', () => {
    const q = inventoryForPrice(0.72, B);
    const yes = quote(q, 'yes', 10, B);
    expect(yes.shares).toBeCloseTo(13.41, 2);
    expect(yes.priceAfter).toBeCloseTo(0.771, 3);
    const no = quote(q, 'no', 10, B);
    expect(no.shares).toBeCloseTo(29.13, 2);
    expect(no.priceAfter).toBeCloseTo(0.589, 3);
  });

  it('charges exactly the stake for the shares it returns', () => {
    const q = inventoryForPrice(0.72, B);
    for (const side of ['yes', 'no'] as const) {
      const shares = sharesForStake(q, side, 10, B);
      expect(lmsrCost(withShares(q, side, shares), B) - lmsrCost(q, B)).toBeCloseTo(10, 8);
    }
  });

  it('round-trips: selling what was bought returns the stake', () => {
    const q = inventoryForPrice(0.4, B);
    for (const side of ['yes', 'no'] as const) {
      const bought = quote(q, side, 25, B);
      const after = withShares(q, side, bought.shares);
      expect(proceedsForShares(after, side, bought.shares, B)).toBeCloseTo(25, 8);
      expect(quoteSell(after, side, bought.shares, B).priceAfter).toBeCloseTo(lmsrPriceYes(q, B), 10);
    }
  });

  it('quotes are monotonic: more points buy more shares at a worse average price', () => {
    const q = inventoryForPrice(0.6, B);
    let prev = quote(q, 'yes', 1, B);
    for (const amount of [2, 5, 10, 25, 50, 100, 400]) {
      const next = quote(q, 'yes', amount, B);
      expect(next.shares).toBeGreaterThan(prev.shares);
      expect(next.avgPrice).toBeGreaterThan(prev.avgPrice);
      expect(next.priceAfter).toBeGreaterThan(prev.priceAfter);
      expect(next.maxPayout).toBe(next.shares);
      prev = next;
    }
  });

  it('keeps the price inside [0, 1] and finite under heavy one-sided flow', () => {
    let q = inventoryForPrice(0.72, B);
    for (let i = 0; i < 400; i++) q = withShares(q, 'yes', sharesForStake(q, 'yes', 10, B));
    const p = lmsrPriceYes(q, B);
    expect(p).toBeLessThanOrEqual(1);
    expect(p).toBeGreaterThan(0.99);
    expect(Number.isFinite(p)).toBe(true);
  });

  it('never pays out more than the average price implies: avg price is below 1 and above the start price', () => {
    const q = inventoryForPrice(0.5, B);
    const r = quote(q, 'yes', 1000, B);
    expect(r.avgPrice).toBeLessThan(1);
    expect(r.avgPrice).toBeGreaterThan(0.5);
  });

  it('returns 0 shares for a non-positive stake', () => {
    expect(sharesForStake({ yes: 0, no: 0 }, 'yes', 0, B)).toBe(0);
    expect(sharesForStake({ yes: 0, no: 0 }, 'no', -5, B)).toBe(0);
    expect(quote({ yes: 0, no: 0 }, 'yes', 0, B).shares).toBe(0);
  });

  it('applies fees to the gross amount on buys and to the proceeds on sells', () => {
    const q = inventoryForPrice(0.5, B);
    const free = quote(q, 'yes', 10, B);
    const taxed = quote(q, 'yes', 10, B, { fee: 0.02 });
    expect(taxed.feePts).toBeCloseTo(0.2, 10);
    expect(taxed.shares).toBeCloseTo(sharesForStake(q, 'yes', 9.8, B), 10);
    expect(taxed.shares).toBeLessThan(free.shares);
    const after = withShares(q, 'yes', free.shares);
    const sell = quoteSell(after, 'yes', free.shares, B, { fee: 0.02 });
    expect(sell.proceedsPts).toBeCloseTo(9.8, 8);
    expect(() => quote(q, 'yes', 10, B, { fee: 1 })).toThrow(RangeError);
  });
});
