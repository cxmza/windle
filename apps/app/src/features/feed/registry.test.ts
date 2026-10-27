import { beforeEach, describe, expect, it } from 'vitest';
import { mapPost } from './live-map';
import { post } from './live-test-support';
import { clearFeedRegistry, registeredTweet, registerFeedTweets } from './registry';

const tweet = (n: number) => {
  const t = mapPost(post(n));
  if (!t) throw new Error('post did not map');
  return t;
};

describe('feed registry', () => {
  beforeEach(() => clearFeedRegistry());

  it('keeps the 500 most recently registered tweets and evicts the oldest first', () => {
    registerFeedTweets(Array.from({ length: 500 }, (_, i) => tweet(i)));
    registerFeedTweets([tweet(0)]);
    registerFeedTweets([tweet(500), tweet(501)]);
    expect(registeredTweet(post(0).id)).not.toBeNull();
    expect(registeredTweet(post(1).id)).toBeNull();
    expect(registeredTweet(post(2).id)).toBeNull();
    expect(registeredTweet(post(3).id)).not.toBeNull();
    expect(registeredTweet(post(501).id)).not.toBeNull();
  });
});
