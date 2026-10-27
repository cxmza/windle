import { beforeEach, describe, expect, it } from 'vitest';
import { createAutoFeed } from './auto-feed';
import { createLiveFeed } from './live-source';
import { FakeStream, fakeEnv, post } from './live-test-support';
import { clearFeedRegistry } from './registry';
import { createSimulatedFeed } from './simulated-source';

function setup(sampleFallback = true) {
  const clock = fakeEnv();
  const live = createLiveFeed({ open: (u) => new FakeStream(u), env: clock.env, random: () => 1, holdMs: 0 });
  const sample = createSimulatedFeed({ env: clock.env });
  const auto = createAutoFeed({ live, sample, env: clock.env, sampleFallback });
  let calls = 0;
  auto.subscribe(() => {
    calls += 1;
  });
  return { clock, auto, calls: () => calls, stream: () => FakeStream.last() };
}

const ids = (auto: ReturnType<typeof setup>['auto']) => auto.getSnapshot().tweets.map((t) => t.id);

describe('createAutoFeed', () => {
  beforeEach(() => {
    FakeStream.reset();
    clearFeedRegistry();
  });

  it('starts live and stays live once the stream delivers', () => {
    const { clock, auto, stream } = setup();
    expect(auto.kind).toBe('live');
    stream().emit('snapshot', { posts: [post(1)] });
    clock.advance(10_000);
    expect(auto.kind).toBe('live');
    expect(ids(auto)).toEqual([post(1).id]);
  });

  it('falls back to the sample feed when no snapshot arrives within the timeout', () => {
    const { clock, auto } = setup();
    clock.advance(4_999);
    expect(auto.kind).toBe('live');
    clock.advance(1);
    expect(auto.kind).toBe('sample');
    expect(auto.getSnapshot().tweets.length).toBeGreaterThan(0);
  });

  it('never shows invented posts when the sample fallback is off', () => {
    const { clock, auto, stream } = setup(false);
    stream().fail(0);
    stream().fail(0);
    stream().fail(0);
    stream().fail(0);
    clock.advance(60_000);
    expect(auto.kind).toBe('live');
    expect(auto.getSnapshot().tweets).toEqual([]);
    expect(auto.getSnapshot().connection).toMatchObject({ everLive: false });
  });

  it('falls back after repeated failures before ever connecting', () => {
    const { auto, stream } = setup();
    stream().fail(0);
    stream().fail(0);
    expect(auto.kind).toBe('live');
    stream().fail(0);
    expect(auto.kind).toBe('sample');
  });

  it('does not replace real posts with sample ones after an outage', () => {
    const { clock, auto, stream } = setup();
    stream().emit('snapshot', { posts: [post(1)] });
    for (let i = 0; i < 5; i += 1) stream().fail(0);
    clock.advance(60_000);
    expect(auto.kind).toBe('live');
    expect(ids(auto)).toEqual([post(1).id]);
    expect(auto.getSnapshot().connection?.status).toBe('reconnecting');
  });

  it('switches back to live on recovery only when the reader is at rest', () => {
    const { clock, auto, stream } = setup();
    clock.advance(5_000);
    expect(auto.kind).toBe('sample');
    const sampleIds = ids(auto);
    auto.settle?.(false);
    stream().emit('snapshot', { posts: [post(1)] });
    expect(auto.kind).toBe('sample');
    expect(ids(auto)).toEqual(sampleIds);
    auto.settle?.(true);
    expect(auto.kind).toBe('live');
    expect(ids(auto)).toEqual([post(1).id]);
  });

  it('notifies subscribers and changes the snapshot when the kind changes', () => {
    const { clock, auto, calls } = setup();
    const before = auto.getSnapshot();
    clock.advance(5_000);
    expect(calls()).toBeGreaterThan(0);
    expect(auto.getSnapshot()).not.toBe(before);
  });

  it('keeps one snapshot identity while nothing changed', () => {
    const { auto } = setup();
    expect(auto.getSnapshot()).toBe(auto.getSnapshot());
  });
});
