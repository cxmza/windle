import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerTime, serverOffset } from '@/lib/server-time';
import { createLiveFeed } from './live-source';
import { FakeStream, fakeEnv, post } from './live-test-support';
import { clearFeedRegistry, feedTweets } from './registry';

function setup(options: Parameters<typeof createLiveFeed>[0] = {}) {
  const clock = fakeEnv();
  const feed = createLiveFeed({
    url: 'http://api.test/v1/x/stream',
    open: (u) => new FakeStream(u),
    env: clock.env,
    random: () => 1,
    holdMs: 0,
    syncClock: async () => {},
    ...options,
  });
  let calls = 0;
  const off = feed.subscribe(() => {
    calls += 1;
  });
  return { clock, feed, off, calls: () => calls, stream: () => FakeStream.last() };
}

const ids = (feed: ReturnType<typeof setup>['feed']) => feed.getSnapshot().tweets.map((t) => t.id);

describe('createLiveFeed', () => {
  beforeEach(() => {
    FakeStream.reset();
    clearFeedRegistry();
  });

  it('connects on subscribe and closes on the last unsubscribe', () => {
    const { off, stream } = setup();
    expect(stream().url).toBe('http://api.test/v1/x/stream');
    off();
    expect(stream().closed).toBe(true);
  });

  it('shows the snapshot and reports the connection as live', () => {
    const { feed, stream } = setup();
    expect(feed.getSnapshot().connection).toMatchObject({ status: 'connecting', everLive: false });
    stream().emit('snapshot', { posts: [post(2), post(1)] });
    expect(ids(feed)).toEqual([post(2).id, post(1).id]);
    expect(feed.getSnapshot().connection).toEqual({ status: 'live', failures: 0, everLive: true });
  });

  it('prepends new posts and replaces the same id in place without moving it', () => {
    const { feed, stream } = setup();
    stream().emit('snapshot', { posts: [post(2), post(1)] });
    stream().emit('post', post(3));
    stream().emit(
      'post',
      post(2, { text: 'richer', media: [{ type: 'image', url: 'https://pbs.twimg.com/media/a.jpg' }] }),
    );
    expect(ids(feed)).toEqual([post(3).id, post(2).id, post(1).id]);
    expect(feed.getSnapshot().tweets[1]).toMatchObject({ text: 'richer', media: [{ kind: 'image' }] });
  });

  it('holds a new id so a second copy merges into it before the row is published', () => {
    const { clock, feed, stream } = setup({ holdMs: 400 });
    stream().emit('snapshot', { posts: [post(1)] });
    stream().emit('post', post(2));
    clock.advance(200);
    expect(ids(feed)).toEqual([post(1).id]);
    stream().emit('post', post(2, { kind: 'reply', inReplyTo: { id: '5', handle: 'bob' } }));
    clock.advance(199);
    expect(ids(feed)).toEqual([post(1).id]);
    clock.advance(1);
    expect(ids(feed)).toEqual([post(2).id, post(1).id]);
    expect(feed.getSnapshot().tweets[0]?.feed).toMatchObject({ kind: 'reply', replyTo: 'bob' });
  });

  it('replaces an already visible id at once, without a hold', () => {
    const { feed, stream } = setup({ holdMs: 400 });
    stream().emit('snapshot', { posts: [post(1)] });
    stream().emit('post', post(1, { text: 'edited' }));
    expect(feed.getSnapshot().tweets[0]?.text).toBe('edited');
  });

  it('a delete during the hold cancels the row', () => {
    const { clock, feed, stream } = setup({ holdMs: 400 });
    stream().emit('snapshot', { posts: [post(1)] });
    stream().emit('post', post(2));
    stream().emit('delete', { id: post(2).id });
    clock.advance(1000);
    expect(ids(feed)).toEqual([post(1).id]);
  });

  it('survives an EventSource that cannot be constructed and keeps retrying', () => {
    let attempts = 0;
    const { clock, feed } = setup({
      open: () => {
        attempts += 1;
        throw new Error('no EventSource');
      },
    });
    expect(feed.getSnapshot().connection).toMatchObject({ status: 'connecting', failures: 1, everLive: false });
    clock.advance(60_000);
    expect(attempts).toBeGreaterThan(1);
  });

  it('marks a deleted post instead of removing it and forgets it in the registry', () => {
    const { feed, stream } = setup();
    stream().emit('snapshot', { posts: [post(2), post(1)] });
    expect(feedTweets(Date.now()).some((t) => t.id === post(1).id)).toBe(true);
    stream().emit('delete', { id: post(1).id });
    expect(ids(feed)).toEqual([post(2).id, post(1).id]);
    expect(feed.getSnapshot().tweets[1]?.feed?.deleted).toBe(true);
    expect(feedTweets(Date.now()).some((t) => t.id === post(1).id)).toBe(false);
  });

  it('drops invalid payloads and keeps going', () => {
    const { feed, stream, calls } = setup();
    stream().emit('snapshot', { posts: [post(1)] });
    const before = calls();
    stream().emit('post', '{"id":"nope"}');
    stream().emit('post', 'garbage');
    stream().emit('delete', '{}');
    expect(calls()).toBe(before);
    expect(ids(feed)).toEqual([post(1).id]);
  });

  it('caps the list', () => {
    const { feed, stream } = setup({ keep: 3 });
    stream().emit('snapshot', { posts: [post(1)] });
    for (const n of [2, 3, 4, 5]) stream().emit('post', post(n));
    expect(ids(feed)).toEqual([post(5).id, post(4).id, post(3).id]);
  });

  it('registers live posts so the create wizard can resolve them', () => {
    const { stream } = setup();
    stream().emit('snapshot', { posts: [post(1)] });
    const hit = feedTweets(Date.now()).find((t) => t.id === post(1).id);
    expect(hit?.author.handle).toBe('alice');
    expect(hit).not.toHaveProperty('feed');
  });

  it('holds the list while paused and publishes it on resume', () => {
    const { feed, stream } = setup();
    stream().emit('snapshot', { posts: [post(1)] });
    feed.pause();
    stream().emit('post', post(2));
    expect(ids(feed)).toEqual([post(1).id]);
    expect(feed.getSnapshot().paused).toBe(true);
    feed.resume();
    expect(ids(feed)).toEqual([post(2).id, post(1).id]);
  });

  it('holds the list in a hidden tab and publishes it when visible', () => {
    const { clock, feed, stream } = setup();
    stream().emit('snapshot', { posts: [post(1)] });
    clock.setHidden(true);
    stream().emit('post', post(2));
    expect(ids(feed)).toEqual([post(1).id]);
    clock.setHidden(false);
    expect(ids(feed)).toEqual([post(2).id, post(1).id]);
  });

  it('lets the browser reconnect while CONNECTING and counts the failure', () => {
    const { feed, stream } = setup();
    stream().emit('snapshot', { posts: [post(1)] });
    stream().fail(0);
    expect(feed.getSnapshot().connection).toEqual({ status: 'reconnecting', failures: 1, everLive: true });
    expect(FakeStream.all).toHaveLength(1);
  });

  it('reconnects with backoff after a closed stream and merges the new snapshot', () => {
    const { clock, feed, stream } = setup();
    stream().emit('snapshot', { posts: [post(2), post(1)] });
    stream().fail(2);
    expect(FakeStream.all).toHaveLength(1);
    clock.advance(999);
    expect(FakeStream.all).toHaveLength(1);
    clock.advance(1);
    expect(FakeStream.all).toHaveLength(2);
    stream().fail(2);
    clock.advance(1_999);
    expect(FakeStream.all).toHaveLength(2);
    clock.advance(1);
    expect(FakeStream.all).toHaveLength(3);
    stream().emit('snapshot', { posts: [post(4), post(3), post(2, { text: 'edited' })] });
    expect(ids(feed)).toEqual([post(4).id, post(3).id, post(2).id, post(1).id]);
    expect(feed.getSnapshot().tweets[2]?.text).toBe('edited');
    expect(feed.getSnapshot().connection).toMatchObject({ status: 'live', failures: 0 });
  });

  it('stops retrying after the last unsubscribe', () => {
    const { clock, off, stream } = setup();
    stream().fail(2);
    off();
    clock.advance(60_000);
    expect(FakeStream.all).toHaveLength(1);
  });
});

describe('server clock', () => {
  beforeEach(() => {
    FakeStream.reset();
    clearFeedRegistry();
    resetServerTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetServerTime();
  });

  it('reads the Date header of /v1/x/recent once, when the feed starts', async () => {
    const date = new Date(1_800_000_000_000 + 39_000).toUTCString();
    const fetchMock = vi.fn(async () => new Response('{"posts":[]}', { status: 200, headers: { date } }));
    vi.stubGlobal('fetch', fetchMock);
    const { feed, off } = setup({ syncClock: undefined });
    await vi.waitFor(() => expect(serverOffset()).toBeGreaterThan(39_000));
    expect(serverOffset()).toBeLessThan(40_000);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/v1/x/recent');
    const second = feed.subscribe(() => {});
    second();
    off();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('tries again on the next start when the request failed', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { off } = setup({ syncClock: undefined });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    off();
  });
});
