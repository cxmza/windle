import { describe, expect, it } from 'vitest';
import { createFixtureMarkets } from '../markets/fixtures';
import { createFixtureProjects } from '../projects/fixtures';
import { createLiveFeed, type DriverEnv, FEED, type LiveEvent, oddsBounds, startDriver } from './feed';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const universe = createFixtureMarkets(NOW);
const base = new Map(universe.map((m) => [m.id, m.shipProbability]));

function fakeEnv() {
  let t = NOW;
  let seq = 0;
  let hidden = false;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const visibility = new Set<() => void>();
  const env: DriverEnv = {
    now: () => t,
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { at: t + ms, fn });
      return seq;
    },
    clearTimeout: (id) => void timers.delete(id),
    hidden: () => hidden,
    onVisibilityChange: (fn) => {
      visibility.add(fn);
      return () => void visibility.delete(fn);
    },
  };
  return {
    env,
    pending: () => timers.size,
    listeners: () => visibility.size,
    setHidden(next: boolean) {
      hidden = next;
      for (const fn of visibility) fn();
    },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
  };
}

describe('live feed', () => {
  it('is deterministic for a seed', () => {
    const run = (seed: number) => {
      const feed = createLiveFeed({ seed, universe });
      return Array.from({ length: 40 }, (_, i) => feed.step(NOW + i)).map(
        (e) => e && [e.kind, e.marketId, e.amountSol],
      );
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('nudges live odds by 1–3 points and keeps them inside the band around the base', () => {
    const feed = createLiveFeed({ seed: 42, universe });
    const events: LiveEvent[] = [];
    for (let i = 0; i < 3000; i += 1) {
      const e = feed.step(NOW + i);
      if (e) events.push(e);
    }
    const trades = events.filter((e) => e.kind === 'trade');
    expect(trades.length).toBeGreaterThan(2000);
    for (const e of trades) {
      const [lo, hi] = oddsBounds(base.get(e.marketId) ?? 50);
      expect(e.to).toBeGreaterThanOrEqual(lo);
      expect(e.to).toBeLessThanOrEqual(hi);
      expect(e.to).toBeGreaterThanOrEqual(FEED.odds.min);
      expect(e.to).toBeLessThanOrEqual(FEED.odds.max);
      expect(Math.abs(e.to - e.from)).toBeLessThanOrEqual(3);
      expect(universe.find((m) => m.id === e.marketId)?.status).toBe('live');
    }
    expect(events.some((e) => e.kind === 'promise')).toBe(true);
    for (const m of feed.applyMarkets(universe)) {
      const [lo, hi] = oddsBounds(base.get(m.id) ?? 50);
      expect(m.shipProbability).toBeGreaterThanOrEqual(lo);
      expect(m.shipProbability).toBeLessThanOrEqual(hi);
    }
  });

  it('keeps unchanged markets by identity and folds activity into projects once', () => {
    const feed = createLiveFeed({ seed: 3, universe });
    expect(feed.applyMarkets(universe)).toBe(universe);
    const projects = createFixtureProjects(NOW);
    for (let i = 0; i < 20; i += 1) feed.step(NOW + i * 1000);
    const once = feed.applyProjects(projects);
    const twice = feed.applyProjects(once);
    expect(twice).toBe(once);
    for (const p of once) {
      const ids = p.activity.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(p.activity.length).toBeLessThanOrEqual(FEED.keepActivity);
    }
    const latest = feed.snapshot().events[0];
    const owner = once.find((p) => p.current.id === latest?.marketId);
    expect(owner?.activity[0]?.id).toBe(latest?.id);
  });

  it('draws delays between 2.5 and 7 seconds', () => {
    const feed = createLiveFeed({ seed: 9, universe });
    for (let i = 0; i < 500; i += 1) {
      const d = feed.nextDelay();
      expect(d).toBeGreaterThanOrEqual(FEED.delay.min);
      expect(d).toBeLessThanOrEqual(FEED.delay.max);
    }
  });
});

describe('live driver', () => {
  it('emits on a randomised cadence', () => {
    const feed = createLiveFeed({ seed: 1, universe });
    const clock = fakeEnv();
    const stop = startDriver(feed, clock.env);
    clock.advance(60_000);
    const n = feed.snapshot().events.length;
    expect(n).toBeGreaterThanOrEqual(Math.floor(60_000 / FEED.delay.max));
    expect(n).toBeLessThanOrEqual(Math.ceil(60_000 / FEED.delay.min));
    stop();
    expect(clock.pending()).toBe(0);
    expect(clock.listeners()).toBe(0);
  });

  it('pauses while the tab is hidden and resumes when it is visible again', () => {
    const feed = createLiveFeed({ seed: 2, universe });
    const clock = fakeEnv();
    const stop = startDriver(feed, clock.env);
    clock.advance(20_000);
    const before = feed.snapshot().events.length;
    clock.setHidden(true);
    expect(clock.pending()).toBe(0);
    clock.advance(120_000);
    expect(feed.snapshot().events.length).toBe(before);
    clock.setHidden(false);
    expect(clock.pending()).toBe(1);
    clock.advance(20_000);
    expect(feed.snapshot().events.length).toBeGreaterThan(before);
    stop();
  });

  it('stops while paused by the viewer', () => {
    const feed = createLiveFeed({ seed: 4, universe });
    const clock = fakeEnv();
    const stop = startDriver(feed, clock.env);
    feed.setPaused(true);
    expect(clock.pending()).toBe(0);
    clock.advance(60_000);
    expect(feed.snapshot().events).toHaveLength(0);
    feed.setPaused(false);
    clock.advance(8000);
    expect(feed.snapshot().events.length).toBeGreaterThan(0);
    stop();
  });
});
