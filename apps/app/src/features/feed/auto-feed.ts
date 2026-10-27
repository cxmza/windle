import { X_FEED_SAMPLE_ALLOWED, X_FEED_SAMPLE_ONLY } from '@/lib/env';
import { browserEnv, type DriverEnv } from '@/lib/timers';
import { liveFeed } from './live-source';
import { simulatedFeed } from './simulated-source';
import type { FeedConnection, FeedSnapshot, TweetFeedSource } from './types';

type Mode = 'live' | 'sample';

export interface AutoFeedOptions {
  live: TweetFeedSource;
  sample: TweetFeedSource;
  env?: DriverEnv;
  /** How long the live stream gets to deliver its first snapshot before the simulated feed takes over. */
  connectTimeoutMs?: number;
  /** Failed attempts before the first snapshot after which the simulated feed takes over. */
  maxFailures?: number;
  /** False in production: an unreachable stream stays an outage instead of being replaced by invented posts. */
  sampleFallback?: boolean;
}

/**
 * Live by default, simulated when the stream never comes up. Once the stream has delivered, the list stays live even
 * through outages (stale rows are better than invented ones; the connection status says so). When the stream recovers
 * while the sample list is showing, the swap waits until the reader is idle at the top, so nothing they are reading is
 * replaced.
 */
export function createAutoFeed(options: AutoFeedOptions): TweetFeedSource {
  const { live, sample } = options;
  const env = options.env ?? browserEnv();
  const timeoutMs = options.connectTimeoutMs ?? 5_000;
  const maxFailures = options.maxFailures ?? 3;
  const sampleFallback = options.sampleFallback ?? true;

  let mode: Mode = 'live';
  let atRest = true;
  let paused = false;
  let timer: number | null = null;
  const listeners = new Set<() => void>();
  let offLive: (() => void) | null = null;
  let offSample: (() => void) | null = null;

  let cache: {
    base: FeedSnapshot;
    connection: FeedConnection | undefined;
    mode: Mode;
    out: FeedSnapshot;
  } | null = null;

  const compose = (): FeedSnapshot => {
    const base = (mode === 'live' ? live : sample).getSnapshot();
    const connection = live.getSnapshot().connection;
    if (cache && cache.base === base && cache.connection === connection && cache.mode === mode) return cache.out;
    const out = { ...base, connection };
    cache = { base, connection, mode, out };
    return out;
  };

  const emit = () => {
    for (const l of listeners) l();
  };

  const clearTimer = () => {
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
  };

  const startSample = () => {
    if (offSample) return;
    offSample = sample.subscribe(emit);
    if (paused) sample.pause();
    else sample.resume();
  };

  const stopSample = () => {
    offSample?.();
    offSample = null;
  };

  const fallBack = () => {
    clearTimer();
    if (!sampleFallback || mode === 'sample') return;
    mode = 'sample';
    startSample();
    emit();
  };

  const trySwitchBack = () => {
    if (mode !== 'sample' || !atRest || !live.getSnapshot().connection?.everLive) return;
    mode = 'live';
    stopSample();
    emit();
  };

  const onLive = () => {
    const c = live.getSnapshot().connection;
    if (c?.everLive) {
      clearTimer();
      trySwitchBack();
    } else if (sampleFallback && mode === 'live' && c && c.failures >= maxFailures) {
      fallBack();
      return;
    }
    emit();
  };

  return {
    get kind(): 'sample' | 'live' {
      return mode;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        offLive = live.subscribe(onLive);
        if (paused) live.pause();
        else live.resume();
        if (mode === 'sample') startSample();
        else if (sampleFallback && !live.getSnapshot().connection?.everLive)
          timer = env.setTimeout(fallBack, timeoutMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearTimer();
          offLive?.();
          offLive = null;
          stopSample();
        }
      };
    },
    getSnapshot: compose,
    pause() {
      paused = true;
      live.pause();
      sample.pause();
    },
    resume() {
      paused = false;
      live.resume();
      if (offSample) sample.resume();
    },
    settle(next) {
      atRest = next;
      trySwitchBack();
    },
  };
}

let shared: TweetFeedSource | undefined;

/**
 * The feed the page uses: the simulated source when pinned with `VITE_X_FEED=sample`, or in development when there is no
 * EventSource. Production never falls back to invented posts; without an EventSource it shows the outage state.
 */
export function defaultFeed(): TweetFeedSource {
  if (X_FEED_SAMPLE_ONLY || (X_FEED_SAMPLE_ALLOWED && typeof EventSource === 'undefined')) return simulatedFeed();
  shared ??= createAutoFeed({ live: liveFeed(), sample: simulatedFeed(), sampleFallback: X_FEED_SAMPLE_ALLOWED });
  return shared;
}
