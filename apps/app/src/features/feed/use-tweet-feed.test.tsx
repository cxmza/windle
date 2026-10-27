import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFS_KEY, reloadPrefs } from '../settings/prefs';
import type { FeedSnapshot, TweetFeedSource } from './types';
import { useTweetFeed } from './use-tweet-feed';

function fakeSource() {
  const snapshot: FeedSnapshot = { tweets: [], paused: false };
  const source: TweetFeedSource = {
    kind: 'sample',
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return source;
}

const setPrefs = (prefs: Record<string, string>) => {
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  reloadPrefs();
};

beforeEach(() => {
  window.localStorage.clear();
  reloadPrefs();
});

describe('useTweetFeed', () => {
  it('runs by default', () => {
    const source = fakeSource();
    const { result } = renderHook(() => useTweetFeed(source));
    expect(result.current.paused).toBe(false);
    expect(source.pause).not.toHaveBeenCalled();
  });

  it('pauses the source when the Live feed setting is off and says why', () => {
    setPrefs({ live: 'off' });
    const source = fakeSource();
    const { result } = renderHook(() => useTweetFeed(source));
    expect(source.pause).toHaveBeenCalled();
    expect(result.current).toMatchObject({ paused: true, liveOff: true });
  });

  it('does not pause under reduced motion: that only changes animation, never the data', () => {
    setPrefs({ motion: 'reduced' });
    const source = fakeSource();
    const { result } = renderHook(() => useTweetFeed(source));
    expect(result.current.paused).toBe(false);
    expect(source.pause).not.toHaveBeenCalled();
  });

  it('toggles the source with the user pause', () => {
    const source = fakeSource();
    const { result } = renderHook(() => useTweetFeed(source));
    act(() => result.current.toggle());
    expect(result.current.paused).toBe(true);
    expect(source.pause).toHaveBeenCalledTimes(1);
    act(() => result.current.toggle());
    expect(result.current.paused).toBe(false);
    expect(source.resume).toHaveBeenCalled();
  });
});
