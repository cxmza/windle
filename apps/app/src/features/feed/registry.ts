import type { TweetSnapshot } from '@windle/shared';
import { buildTweet } from './build';
import { POOL } from './pool';
import { type FeedTweet, sourceTweet } from './types';

const MAX_REGISTERED = 500;

/** Insertion order is recency order: a re-registered id moves to the back, the front is evicted first. */
const registered = new Map<string, TweetSnapshot>();

/**
 * Every tweet the feed has shown, so the create wizard can resolve it by id like any fixture tweet. A repost registers
 * its original, the tweet a market from that row is about.
 */
export function registerFeedTweets(tweets: readonly FeedTweet[]): void {
  for (const tweet of tweets) {
    const source = sourceTweet(tweet);
    if (!source) continue;
    registered.delete(source.id);
    registered.set(source.id, source);
  }
  for (const id of registered.keys()) {
    if (registered.size <= MAX_REGISTERED) break;
    registered.delete(id);
  }
}

/** A tweet the feed has already shown, by status id; null when it has not been seen. */
export function registeredTweet(id: string): TweetSnapshot | null {
  return registered.get(id) ?? null;
}

export function forgetFeedTweet(id: string): void {
  registered.delete(id);
}

export function clearFeedRegistry(): void {
  registered.clear();
}

/** Tweets the lookup can resolve: the ones already emitted, plus the pool's first pass for links opened cold. */
export function feedTweets(now: number): readonly TweetSnapshot[] {
  const cold: TweetSnapshot[] = [];
  POOL.forEach((_, i) => {
    const t = buildTweet(i, 0, now - (i + 1) * 7 * 60_000);
    if (t && !registered.has(t.id)) cold.push(t);
  });
  return [...registered.values(), ...cold];
}
