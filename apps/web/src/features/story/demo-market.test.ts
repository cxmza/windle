import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buy, getSnapshot, reset, STAKE, subscribe } from './demo-market';

describe('demo market store', () => {
  beforeEach(() => reset());

  it('opens at the example prices with an empty position', () => {
    const s = getSnapshot();
    expect([s.yes, s.no]).toEqual([72, 28]);
    expect(s.position).toMatchObject({ yesShares: 0, noShares: 0, spent: 0, value: 0 });
    expect(s.trades).toBe(0);
    expect(s.lastTrade).toBeNull();
  });

  it('buying YES raises YES, keeps yes + no = 100 and records the position', () => {
    buy('yes');
    const s = getSnapshot();
    expect(s.yes).toBeGreaterThan(72);
    expect(s.yes + s.no).toBe(100);
    expect(s.position.yesShares).toBeGreaterThan(STAKE); // bought below 1 per share
    expect(s.position.spent).toBe(STAKE);
    expect(s.lastTrade).toMatchObject({ side: 'yes', stake: STAKE });
    expect(s.trades).toBe(1);
  });

  it('buying NO lowers YES', () => {
    buy('no');
    expect(getSnapshot().yes).toBeLessThan(72);
    expect(getSnapshot().position.noShares).toBeGreaterThan(0);
  });

  it('replaces the snapshot on change only, and notifies subscribers', () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    const before = getSnapshot();
    expect(getSnapshot()).toBe(before);
    buy('yes');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSnapshot()).not.toBe(before);
    expect(getSnapshot().version).toBe(before.version + 1);
    off();
    buy('yes');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid stakes', () => {
    const before = getSnapshot();
    buy('yes', 0);
    buy('yes', Number.NaN);
    expect(getSnapshot()).toBe(before);
  });

  it('reset restores the opening state and bumps version', () => {
    buy('yes');
    const v = getSnapshot().version;
    reset();
    const s = getSnapshot();
    expect([s.yes, s.no, s.trades]).toEqual([72, 28, 0]);
    expect(s.position.spent).toBe(0);
    expect(s.version).toBe(v + 1);
  });
});
