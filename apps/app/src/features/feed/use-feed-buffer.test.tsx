import { act, renderHook } from '@testing-library/react';
import type { TweetSnapshot } from '@windle/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anchoredScrollTop, useFeedBuffer, useThrottledCount } from './use-feed-buffer';

const tweet = (n: number): TweetSnapshot => ({
  id: String(10_000 + n),
  url: `https://x.com/a/status/${10_000 + n}`,
  author: { handle: 'a', name: 'A' },
  text: `t${n}`,
  createdAt: '2026-10-12T10:00:00.000Z',
  capturedAt: '2026-10-12T10:00:00.000Z',
});

const list = (...ns: number[]) => ns.map(tweet);
const ids = (ts: readonly TweetSnapshot[]) => ts.map((t) => t.text);

describe('useFeedBuffer', () => {
  it('shows new tweets immediately while nothing holds the list', () => {
    const { result, rerender } = renderHook(({ ts, hold }) => useFeedBuffer(ts, hold), {
      initialProps: { ts: list(2, 1), hold: false },
    });
    rerender({ ts: list(3, 2, 1), hold: false });
    expect(ids(result.current.shown)).toEqual(['t3', 't2', 't1']);
    expect(result.current.pending).toBe(0);
  });

  it('buffers while held, counts them, and reveals on demand', () => {
    const { result, rerender } = renderHook(({ ts, hold }) => useFeedBuffer(ts, hold), {
      initialProps: { ts: list(2, 1), hold: true },
    });
    rerender({ ts: list(4, 3, 2, 1), hold: true });
    expect(ids(result.current.shown)).toEqual(['t2', 't1']);
    expect(result.current.pending).toBe(2);

    rerender({ ts: list(5, 4, 3, 2, 1), hold: true });
    expect(result.current.pending).toBe(3);

    act(() => result.current.reveal());
    expect(ids(result.current.shown)).toEqual(['t5', 't4', 't3', 't2', 't1']);
    expect(result.current.pending).toBe(0);
  });

  it('flushes the buffer when the hold ends', () => {
    const { result, rerender } = renderHook(({ ts, hold }) => useFeedBuffer(ts, hold), {
      initialProps: { ts: list(2, 1), hold: true },
    });
    rerender({ ts: list(3, 2, 1), hold: true });
    expect(result.current.pending).toBe(1);
    rerender({ ts: list(3, 2, 1), hold: false });
    expect(result.current.pending).toBe(0);
    expect(ids(result.current.shown)).toEqual(['t3', 't2', 't1']);
  });
});

describe('useFeedBuffer cadence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const cadence = { everyMs: 1500, maxRows: 2 };
  const setup = () => renderHook(({ ts }) => useFeedBuffer(ts, false, cadence), { initialProps: { ts: list(2, 1) } });

  it('shows the first row after a quiet spell at once, then meters later arrivals into batches', () => {
    const { result, rerender } = setup();
    rerender({ ts: list(3, 2, 1) });
    act(() => vi.advanceTimersByTime(0));
    expect(ids(result.current.shown)).toEqual(['t3', 't2', 't1']);

    rerender({ ts: list(4, 3, 2, 1) });
    rerender({ ts: list(5, 4, 3, 2, 1) });
    rerender({ ts: list(6, 5, 4, 3, 2, 1) });
    act(() => vi.advanceTimersByTime(1499));
    expect(ids(result.current.shown)).toEqual(['t3', 't2', 't1']);
    act(() => vi.advanceTimersByTime(1));
    expect(ids(result.current.shown)).toEqual(['t5', 't4', 't3', 't2', 't1']);
    expect(result.current.pending).toBe(0);
    act(() => vi.advanceTimersByTime(1500));
    expect(ids(result.current.shown)).toEqual(['t6', 't5', 't4', 't3', 't2', 't1']);
  });

  it('a hold still freezes the head and a release shows everything at once', () => {
    const { result, rerender } = renderHook(({ ts, hold }) => useFeedBuffer(ts, hold, cadence), {
      initialProps: { ts: list(2, 1), hold: true },
    });
    rerender({ ts: list(5, 4, 3, 2, 1), hold: true });
    act(() => vi.advanceTimersByTime(5000));
    expect(ids(result.current.shown)).toEqual(['t2', 't1']);
    expect(result.current.pending).toBe(3);
    rerender({ ts: list(5, 4, 3, 2, 1), hold: false });
    expect(ids(result.current.shown)).toEqual(['t5', 't4', 't3', 't2', 't1']);
  });
});

describe('anchoredScrollTop', () => {
  it('moves by the height that was added above the viewport', () => {
    expect(anchoredScrollTop(300, 2000, 2120)).toBe(420);
  });

  it('leaves a list at the very top alone, so new rows land there', () => {
    expect(anchoredScrollTop(0, 2000, 2120)).toBe(0);
  });
});

describe('useThrottledCount', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces the first count at once and later ones at most once per interval', () => {
    const { result, rerender } = renderHook(({ n }) => useThrottledCount(n, 8000), { initialProps: { n: 0 } });
    rerender({ n: 1 });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(1);

    rerender({ n: 2 });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(1);
    rerender({ n: 3 });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(3);
  });

  it('clears immediately when nothing is pending', () => {
    const { result, rerender } = renderHook(({ n }) => useThrottledCount(n, 8000), { initialProps: { n: 2 } });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(2);
    rerender({ n: 0 });
    expect(result.current).toBe(0);
  });
});
