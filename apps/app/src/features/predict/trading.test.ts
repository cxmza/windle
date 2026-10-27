import { quote, quoteSell } from '@windle/shared';
import { describe, expect, it } from 'vitest';
import { ISO, makeMarket } from './test-support';
import {
  buyGuard,
  isTradable,
  previewBuy,
  previewSell,
  SLIPPAGE_TOLERANCE,
  sellAmount,
  sellGuard,
  tradeBlock,
} from './trading';

const market = makeMarket({ prob: 0.5 });
const NOW = Date.now();

describe('who can trade', () => {
  it('needs the server flag and a deadline still ahead of this clock', () => {
    expect(isTradable(market, NOW)).toBe(true);
    expect(isTradable(market, Date.parse(market.deadline) + 1)).toBe(false);
    expect(isTradable({ ...market, tradable: false }, NOW)).toBe(false);
  });

  it('names why: closed first, then the creator, otherwise nothing', () => {
    expect(tradeBlock(market, NOW)).toBeNull();
    expect(tradeBlock({ ...market, tradable: false }, NOW)).toBe('closed');
    const own = { ...market, viewer: { isCreator: true, canTrade: false, canResolve: true } };
    expect(tradeBlock(own, NOW)).toBe('creator');
    expect(tradeBlock({ ...own, deadline: ISO(NOW - 1000) }, NOW)).toBe('closed');
  });
});

describe('previews', () => {
  it('quotes a buy with the shared LMSR and checks the balance only when it is known', () => {
    const q = quote({ yes: market.qYes, no: market.qNo }, 'yes', 50, market.liquidityB);
    const known = previewBuy(market, 100, 'yes', 50);
    expect(known.problem).toBeNull();
    expect(known.quote?.shares).toBeCloseTo(q.shares, 10);
    expect(previewBuy(market, 40, 'yes', 50).problem).toBe('insufficient_balance');
    expect(previewBuy(market, null, 'yes', 50).problem).toBeNull();
    expect(previewBuy(market, 100, 'yes', 0.5)).toEqual({ quote: null, problem: 'invalid_amount' });
    expect(previewBuy(market, 100, 'yes', Number.NaN).problem).toBe('invalid_amount');
  });

  it('quotes a sell and refuses more shares than held', () => {
    expect(previewSell(market, 10, 'yes', 4).problem).toBeNull();
    expect(previewSell(market, 10, 'yes', 4).quote?.proceedsPts).toBeGreaterThan(0);
    expect(previewSell(market, 10, 'yes', 11).problem).toBe('insufficient_shares');
    expect(previewSell(market, 10, 'yes', 10.0000000001).problem).toBeNull();
    expect(previewSell(market, 0, 'yes', 1).problem).toBe('insufficient_shares');
    expect(previewSell(market, 10, 'yes', 0)).toEqual({ quote: null, problem: 'invalid_amount' });
  });
});

describe('slippage guards', () => {
  it('lets a buy lose the tolerance and no more', () => {
    expect(SLIPPAGE_TOLERANCE).toBe(0.02);
    const q = quote({ yes: market.qYes, no: market.qNo }, 'no', 80, market.liquidityB);
    const { minShares } = buyGuard(market, 'no', 80);
    expect(minShares).toBeCloseTo(q.shares * (1 - SLIPPAGE_TOLERANCE), 10);
    const slightlyMoved = quote({ yes: market.qYes + 0.5, no: market.qNo }, 'no', 80, market.liquidityB);
    expect(slightlyMoved.shares).toBeGreaterThan(minShares);
    const movedAgainstUs = quote({ yes: market.qYes, no: market.qNo + 20 }, 'no', 80, market.liquidityB);
    expect(movedAgainstUs.shares).toBeLessThan(minShares);
  });

  it('lets a sell receive the tolerance less and no more', () => {
    const q = quoteSell({ yes: market.qYes, no: market.qNo }, 'yes', 12, market.liquidityB);
    expect(sellGuard(market, 'yes', 12).minProceedsPts).toBeCloseTo(q.proceedsPts * (1 - SLIPPAGE_TOLERANCE), 10);
  });
});

describe('selling everything', () => {
  it('sends the exact holding when the typed amount is the Max chip, and the typed amount otherwise', () => {
    const owned = 12.3456789012;
    expect(sellAmount(12.3456789, owned)).toBe(owned);
    expect(sellAmount(owned, owned)).toBe(owned);
    expect(sellAmount(5, owned)).toBe(5);
  });
});
