import { parseTweetUrl, type TweetSnapshot } from '@windle/shared';
import { X_FEED_SAMPLE_ALLOWED } from '@/lib/env';
import { fetchXPost } from '../feed/post-api';
import { feedTweets, registeredTweet } from '../feed/registry';
import { fail, ok, type Result } from './types';

const NOT_FOUND = 'We could not find that tweet. It may be deleted, private or from a protected account.';

const captured = (tweet: TweetSnapshot): TweetSnapshot => ({
  ...tweet,
  capturedAt: new Date(Date.now()).toISOString(),
});

/**
 * Resolves a status id to a snapshot. A tweet the feed already showed resolves at once; anything else is asked of the
 * relay (`GET /v1/x/post/:id`, enriched). Only in development, where the invented pool exists, may that pool answer
 * for a link the relay does not know.
 */
export async function lookupTweet(statusId: string): Promise<Result<TweetSnapshot>> {
  const seen = registeredTweet(statusId);
  if (seen) return ok(captured(seen));

  const remote = await fetchXPost(statusId);
  if (remote.status === 'ok') return ok(captured(remote.tweet));
  if (X_FEED_SAMPLE_ALLOWED) {
    const cold = feedTweets(Date.now()).find((t) => t.id === statusId);
    if (cold) return ok(captured(cold));
  }
  if (remote.status === 'rate_limited')
    return fail('x_rate_limited', 'X is rate limiting lookups. Wait a moment and try again.');
  if (remote.status === 'unavailable' || remote.status === 'offline')
    return fail('x_feed_unavailable', 'X feed unavailable, try again.');
  return fail('tweet_not_found', NOT_FOUND);
}

export async function lookupTweetByUrl(url: string): Promise<Result<TweetSnapshot>> {
  const parsed = parseTweetUrl(url);
  if (!parsed.ok) return fail('invalid_tweet_url', parsed.message);
  return lookupTweet(parsed.statusId);
}

const POOL_ID = /^19\d{3}00000000\d{5}$/;

/** True for the development pool's invented tweets: they exist only here, so X has nothing to say about them. */
export const isSampleTweetId = (id: string): boolean => POOL_ID.test(id);
