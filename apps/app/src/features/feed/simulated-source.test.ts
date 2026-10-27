import { beforeEach, describe, expect, it } from 'vitest';
import type { DriverEnv } from '@/lib/timers';
import { lookupTweet } from '../predict/tweets';
import { tweetId } from './build';
import { classifyTweet } from './classify';
import { POOL } from './pool';
import { clearFeedRegistry } from './registry';
import { createSimulatedFeed } from './simulated-source';

const T0 = Date.parse('2026-10-12T12:00:00.000Z');

function fakeEnv() {
  let now = T0;
  let seq = 0;
  let hidden = false;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const visibility = new Set<() => void>();
  const env: DriverEnv = {
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    hidden: () => hidden,
    onVisibilityChange: (fn) => {
      visibility.add(fn);
      return () => visibility.delete(fn);
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  const setHidden = (value: boolean) => {
    hidden = value;
    for (const fn of visibility) fn();
  };
  return { env, advance, setHidden, pending: () => timers.size };
}

const make = (seed = 1) => {
  const fake = fakeEnv();
  const feed = createSimulatedFeed({ seed, env: fake.env });
  return { feed, ...fake };
};

beforeEach(() => {
  clearFeedRegistry();
});

describe('simulated feed', () => {
  it('starts with about fifteen recent tweets, newest first, all in the past', () => {
    const { feed } = make();
    const { tweets, paused } = feed.getSnapshot();
    expect(tweets).toHaveLength(15);
    expect(paused).toBe(false);
    const times = tweets.map((t) => Date.parse(t.createdAt));
    expect(times.every((t) => t < T0 && t > T0 - 60 * 60_000)).toBe(true);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(new Set(tweets.map((t) => t.id)).size).toBe(15);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const ids = (seed: number) =>
      make(seed)
        .feed.getSnapshot()
        .tweets.map((t) => t.id);
    expect(ids(7)).toEqual(ids(7));
    expect(ids(7)).not.toEqual(ids(8));
  });

  it('mixes promises, updates and chatter in the backlog pool', () => {
    const kinds = new Set(POOL.map((p) => classifyTweet(p.text)));
    expect(kinds.has('promise')).toBe(true);
    expect(kinds.has('update')).toBe(true);
    expect(kinds.has('other')).toBe(true);
    expect(POOL.length).toBeGreaterThanOrEqual(40);
  });

  it('emits a new tweet every 4 to 12 seconds while somebody listens', () => {
    const { feed, advance } = make();
    const seen: number[] = [];
    feed.subscribe(() => seen.push(feed.getSnapshot().tweets.length));
    advance(3_900);
    expect(seen).toHaveLength(0);
    advance(60_000);
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen.length).toBeLessThanOrEqual(15);
    expect(Date.parse(feed.getSnapshot().tweets[0]?.createdAt ?? '')).toBeGreaterThan(T0 + 50_000);
  });

  it('prepends: the newest tweet is first and older ones keep their place', () => {
    const { feed, advance } = make();
    const before = feed.getSnapshot().tweets.map((t) => t.id);
    feed.subscribe(() => {});
    advance(12_000);
    const after = feed.getSnapshot().tweets.map((t) => t.id);
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.slice(after.length - before.length)).toEqual(before);
  });

  it('does not run without a listener', () => {
    const { feed, advance, pending } = make();
    advance(60_000);
    expect(feed.getSnapshot().tweets).toHaveLength(15);
    expect(pending()).toBe(0);
  });

  it('stops while paused, reports it, and picks up again on resume', () => {
    const { feed, advance } = make();
    feed.subscribe(() => {});
    advance(12_000);
    const n = feed.getSnapshot().tweets.length;
    feed.pause();
    expect(feed.getSnapshot().paused).toBe(true);
    advance(120_000);
    expect(feed.getSnapshot().tweets).toHaveLength(n);
    feed.resume();
    expect(feed.getSnapshot().paused).toBe(false);
    advance(12_000);
    expect(feed.getSnapshot().tweets.length).toBeGreaterThan(n);
  });

  it('idles while the tab is hidden and continues when it is visible again', () => {
    const { feed, advance, setHidden } = make();
    feed.subscribe(() => {});
    setHidden(true);
    advance(120_000);
    expect(feed.getSnapshot().tweets).toHaveLength(15);
    setHidden(false);
    advance(12_000);
    expect(feed.getSnapshot().tweets.length).toBeGreaterThan(15);
  });

  it('stops its timer when the last listener leaves', () => {
    const { feed, pending } = make();
    const off = feed.subscribe(() => {});
    expect(pending()).toBe(1);
    off();
    expect(pending()).toBe(0);
  });

  it('keeps going past the end of the pool with fresh ids', () => {
    const { feed, advance } = make();
    feed.subscribe(() => {});
    advance(12_000 * 70);
    const ids = feed.getSnapshot().tweets.map((t) => t.id);
    expect(ids.length).toBeGreaterThan(50);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('feed tweets and the rest of the app', () => {
  it('resolves every emitted tweet through the wizard lookup', async () => {
    const { feed, advance } = make();
    feed.subscribe(() => {});
    advance(30_000);
    for (const t of feed.getSnapshot().tweets) {
      const found = await lookupTweet(t.id);
      expect(found.ok, t.id).toBe(true);
    }
  });

  it('resolves pool tweets that were never emitted, so a pasted link works on a cold start', async () => {
    const found = await lookupTweet(tweetId(7, 0));
    expect(found.ok).toBe(true);
  });
});
