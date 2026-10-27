import type { TweetSnapshot } from '@windle/shared';
import { browserEnv, type DriverEnv, mulberry32, type Rng } from '@/lib/timers';
import { buildTweet } from './build';
import { POOL } from './pool';
import { registerFeedTweets } from './registry';
import type { FeedSnapshot, TweetFeedSource } from './types';

export interface SimulatedFeedOptions {
  seed?: number;
  env?: DriverEnv;
  /** How many tweets already exist when the feed starts. */
  initial?: number;
  minGapMs?: number;
  maxGapMs?: number;
  keep?: number;
}

const DEFAULTS = { seed: 0x7e3d, initial: 15, minGapMs: 4_000, maxGapMs: 12_000, keep: 120 } as const;

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * Deterministic stand-in for the X firehose: a seeded pool of fictional teams and noise accounts, a backlog of recent
 * tweets and one new tweet every few seconds while somebody listens, the tab is visible and the feed is not paused.
 */
export function createSimulatedFeed(options: SimulatedFeedOptions = {}): TweetFeedSource {
  const cfg = { ...DEFAULTS, ...options };
  const env = options.env ?? browserEnv();
  const rng = mulberry32(cfg.seed);

  const queue: { index: number; cycle: number }[] = [];
  let cycle = 0;
  const refill = () => {
    const indexes = POOL.map((_, i) => i);
    for (const index of shuffle(indexes, rng)) queue.push({ index, cycle });
    cycle += 1;
  };
  refill();
  const take = () => {
    if (queue.length === 0) refill();
    return queue.shift();
  };

  const startedAt = env.now();
  const backlog = shuffle(queue.splice(0, cfg.initial), rng);
  let age = 0;
  const history: TweetSnapshot[] = [];
  for (const slot of backlog) {
    age += 15_000 + Math.floor(rng() * 200_000);
    const tweet = buildTweet(slot.index, slot.cycle, startedAt - age);
    if (tweet) history.push(tweet);
  }
  registerFeedTweets(history);

  let snapshot: FeedSnapshot = { tweets: history, paused: false };
  const listeners = new Set<() => void>();
  let timer: number | null = null;

  const publish = (next: FeedSnapshot) => {
    snapshot = next;
    for (const l of listeners) l();
  };

  const clear = () => {
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
  };

  const emit = () => {
    const slot = take();
    if (!slot) return;
    const tweet = buildTweet(slot.index, slot.cycle, env.now());
    if (!tweet) return;
    registerFeedTweets([tweet]);
    publish({ ...snapshot, tweets: [tweet, ...snapshot.tweets].slice(0, cfg.keep) });
  };

  const schedule = () => {
    clear();
    if (listeners.size === 0 || snapshot.paused || env.hidden()) return;
    const gap = cfg.minGapMs + Math.floor(rng() * (cfg.maxGapMs - cfg.minGapMs));
    timer = env.setTimeout(() => {
      timer = null;
      emit();
      schedule();
    }, gap);
  };

  let offVisibility: (() => void) | null = null;

  return {
    kind: 'sample',
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        offVisibility = env.onVisibilityChange(schedule);
        schedule();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clear();
          offVisibility?.();
          offVisibility = null;
        }
      };
    },
    getSnapshot: () => snapshot,
    pause() {
      if (snapshot.paused) return;
      clear();
      publish({ ...snapshot, paused: true });
    },
    resume() {
      if (!snapshot.paused) return;
      publish({ ...snapshot, paused: false });
      schedule();
    },
  };
}

let shared: TweetFeedSource | undefined;

export const simulatedFeed = (): TweetFeedSource => {
  shared ??= createSimulatedFeed();
  return shared;
};

export function resetSimulatedFeed(): void {
  shared = undefined;
}
