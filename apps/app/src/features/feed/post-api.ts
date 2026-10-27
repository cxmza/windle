import type { TweetSnapshot } from '@windle/shared';
import { API_URL } from '@/lib/env';
import { loadXPost } from '../tweet/x-post-api';
import { mapPost } from './live-map';
import { registerFeedTweets } from './registry';
import { sourceTweet } from './types';

/** `offline`: the api could not be reached at all, as opposed to answering that the feed is down. */
export type XPostLookup =
  | { status: 'ok'; tweet: TweetSnapshot }
  | { status: 'not_found' }
  | { status: 'rate_limited' }
  | { status: 'unavailable' }
  | { status: 'offline' };

/** A pasted link asks the api to enrich: the answer is the full post from X, not just what the relay saw. */
export async function fetchXPost(statusId: string, base: string = API_URL): Promise<XPostLookup> {
  const res = await loadXPost(statusId, true, base);
  if (res.status !== 'ok') return res.status === 'rate_limited' ? { status: 'rate_limited' } : { status: res.status };
  const mapped = mapPost(res.post);
  const tweet = mapped ? sourceTweet(mapped) : null;
  if (!mapped || !tweet) return { status: 'not_found' };
  registerFeedTweets([mapped]);
  return { status: 'ok', tweet };
}
