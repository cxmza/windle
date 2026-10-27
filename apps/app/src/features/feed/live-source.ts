import { X_STREAM_EVENTS } from '@windle/shared';
import { API_URL } from '@/lib/env';
import { observeResponse, observeServerLowerBound } from '@/lib/server-time';
import { browserEnv, type DriverEnv } from '@/lib/timers';
import { parseDeleted, parsePost, parseSnapshot } from './live-map';
import { forgetFeedTweet, registerFeedTweets } from './registry';
import type { ConnectionStatus, FeedConnection, FeedSnapshot, FeedTweet, TweetFeedSource } from './types';

export interface StreamLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

const CLOSED = 2;

export interface LiveFeedOptions {
  url?: string;
  open?: (url: string) => StreamLike;
  env?: DriverEnv;
  keep?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  /** How long a first copy of a new post waits for its duplicates before the row is published. */
  holdMs?: number;
  /** Reads the server's clock from the `Date` header of a plain request; the default asks `/v1/x/recent`. */
  syncClock?: () => Promise<void>;
}

export const streamUrl = (base: string = API_URL): string => `${base}/v1/x/stream`;

/**
 * A post's `capturedAt` only says the server was past that moment, so ages built from it run a few seconds behind. The
 * `Date` header of any answer is the server's own clock: one cheap request at the start gives the offset directly.
 */
async function readServerClock(base: string = API_URL): Promise<void> {
  const sentAt = Date.now();
  const res = await fetch(`${base}/v1/x/recent?limit=1`, { headers: { accept: 'application/json' } });
  observeResponse(res, sentAt, Date.now());
  await res.body?.cancel().catch(() => {});
}

/**
 * The X stream as a feed source. Posts are validated one by one, the same id is replaced in place (never moved or
 * duplicated), a delete marks the row instead of removing it so nothing below it shifts. A new id is held for `holdMs`
 * so a second copy that enriches it lands before the row exists, not as growth of a visible row. While the feed is
 * paused or the tab is hidden the connection stays up and posts accumulate; the list is published when both clear.
 */
export function createLiveFeed(options: LiveFeedOptions = {}): TweetFeedSource {
  const env = options.env ?? browserEnv();
  const url = options.url ?? streamUrl();
  const open = options.open ?? ((u: string): StreamLike => new EventSource(u));
  const keep = options.keep ?? 200;
  const baseDelay = options.baseDelayMs ?? 1_000;
  const maxDelay = options.maxDelayMs ?? 30_000;
  const random = options.random ?? Math.random;
  const holdMs = options.holdMs ?? 400;
  const syncClock = options.syncClock ?? (() => readServerClock());
  let clockRead = false;

  let latest: readonly FeedTweet[] = [];
  let shown: readonly FeedTweet[] = [];
  let paused = false;
  let status: ConnectionStatus = 'connecting';
  let failures = 0;
  let everLive = false;
  let snapshot: FeedSnapshot = { tweets: shown, paused, connection: { status, failures, everLive } };

  const listeners = new Set<() => void>();
  let stream: StreamLike | null = null;
  let retry: number | null = null;
  const held = new Map<string, { tweet: FeedTweet; timer: number }>();
  let offVisibility: (() => void) | null = null;

  const flush = () => {
    const holding = paused || env.hidden();
    const tweets = holding ? shown : latest;
    const connection: FeedConnection = { status, failures, everLive };
    const prev = snapshot.connection;
    if (
      tweets === snapshot.tweets &&
      paused === snapshot.paused &&
      prev?.status === status &&
      prev.failures === failures &&
      prev.everLive === everLive
    )
      return;
    shown = tweets;
    snapshot = { tweets, paused, connection };
    for (const l of listeners) l();
  };

  const insert = (tweet: FeedTweet) => {
    const at = latest.findIndex((t) => t.id === tweet.id);
    if (at === -1) latest = [tweet, ...latest].slice(0, keep);
    else latest = latest.map((t, i) => (i === at ? tweet : t));
  };

  const release = (id: string) => {
    const entry = held.get(id);
    if (!entry) return;
    held.delete(id);
    insert(entry.tweet);
    flush();
  };

  const upsert = (tweet: FeedTweet) => {
    registerFeedTweets([tweet]);
    const waiting = held.get(tweet.id);
    if (waiting) {
      waiting.tweet = tweet;
      return false;
    }
    const visible = latest.some((t) => t.id === tweet.id);
    if (visible || holdMs <= 0) {
      insert(tweet);
      return true;
    }
    held.set(tweet.id, { tweet, timer: env.setTimeout(() => release(tweet.id), holdMs) });
    return false;
  };

  const onSnapshot = (event: MessageEvent) => {
    const posts = parseSnapshot(event.data);
    if (!posts) return;
    for (const p of posts) observeServerLowerBound(Date.parse(p.capturedAt));
    failures = 0;
    status = 'live';
    everLive = true;
    if (latest.length === 0) {
      latest = posts.slice(0, keep);
      registerFeedTweets(latest);
    } else {
      const known = new Set(latest.map((t) => t.id));
      const fresh = posts.filter((p) => !known.has(p.id));
      const byId = new Map(posts.map((p) => [p.id, p]));
      latest = [...fresh, ...latest.map((t) => byId.get(t.id) ?? t)].slice(0, keep);
      registerFeedTweets(latest.filter((t) => !t.feed?.deleted));
    }
    flush();
  };

  const onPost = (event: MessageEvent) => {
    const tweet = parsePost(event.data);
    if (!tweet) return;
    observeServerLowerBound(Date.parse(tweet.capturedAt));
    if (upsert(tweet)) flush();
  };

  const onDelete = (event: MessageEvent) => {
    const id = parseDeleted(event.data);
    if (id === null) return;
    const waiting = held.get(id);
    if (waiting) {
      env.clearTimeout(waiting.timer);
      held.delete(id);
      forgetFeedTweet(id);
      return;
    }
    const at = latest.findIndex((t) => t.id === id);
    const hit = latest[at];
    const extras = hit?.feed;
    if (!hit || !extras) return;
    const marked: FeedTweet = { ...hit, feed: { ...extras, deleted: true } };
    latest = latest.map((t, i) => (i === at ? marked : t));
    forgetFeedTweet(id);
    flush();
  };

  const handlers = { snapshot: onSnapshot, post: onPost, delete: onDelete } as const;

  const dropHeld = () => {
    for (const [id, entry] of held) {
      env.clearTimeout(entry.timer);
      insert(entry.tweet);
      held.delete(id);
    }
  };

  const close = () => {
    if (retry !== null) env.clearTimeout(retry);
    retry = null;
    if (stream) {
      stream.onopen = null;
      stream.onerror = null;
      stream.close();
    }
    stream = null;
  };

  const scheduleRetry = () => {
    const delay = Math.min(maxDelay, baseDelay * 2 ** Math.min(failures - 1, 10));
    retry = env.setTimeout(
      () => {
        retry = null;
        if (listeners.size > 0) connect();
      },
      Math.round(delay * (0.5 + random() * 0.5)),
    );
  };

  const connect = () => {
    close();
    let next: StreamLike;
    try {
      next = open(url);
    } catch {
      failures += 1;
      status = everLive ? 'reconnecting' : 'connecting';
      flush();
      scheduleRetry();
      return;
    }
    stream = next;
    for (const type of X_STREAM_EVENTS) next.addEventListener(type, handlers[type]);
    next.onerror = () => {
      if (stream !== next) return;
      failures += 1;
      status = everLive ? 'reconnecting' : 'connecting';
      flush();
      if (next.readyState === CLOSED) {
        close();
        scheduleRetry();
      }
    };
  };

  return {
    kind: 'live',
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        if (!clockRead) {
          clockRead = true;
          syncClock().catch(() => {
            clockRead = false;
          });
        }
        offVisibility = env.onVisibilityChange(flush);
        connect();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          close();
          dropHeld();
          offVisibility?.();
          offVisibility = null;
          if (everLive) status = 'reconnecting';
        }
      };
    },
    getSnapshot: () => snapshot,
    pause() {
      if (paused) return;
      paused = true;
      flush();
    },
    resume() {
      if (!paused) return;
      paused = false;
      flush();
    },
  };
}

let shared: TweetFeedSource | undefined;

export const liveFeed = (): TweetFeedSource => {
  shared ??= createLiveFeed();
  return shared;
};
