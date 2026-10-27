import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapPost } from '../feed/live-map';
import { post } from '../feed/live-test-support';
import { clearFeedRegistry, registerFeedTweets } from '../feed/registry';
import { clearXPostCache } from '../tweet/x-post-api';
import { lookupTweet } from './tweets';

const seen = post(7);
const cold = post(9, { text: 'a post nobody has shown yet' });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  clearFeedRegistry();
  clearXPostCache();
});
afterEach(() => vi.useRealTimers());

describe('lookupTweet', () => {
  it('says the feed is unavailable, not that the tweet is missing, when the api cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    const res = await lookupTweet(cold.id);
    expect(!res.ok && res.error.code).toBe('x_feed_unavailable');
    vi.unstubAllGlobals();
  });

  it('resolves a tweet the feed already showed without a timer or a request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const mapped = mapPost(seen);
    if (!mapped) throw new Error('post did not map');
    registerFeedTweets([mapped]);
    const res = await lookupTweet(seen.id);
    expect(res.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the relay for a link it has not seen and maps the post', async () => {
    const fetchMock = vi.fn(async () => json(cold));
    vi.stubGlobal('fetch', fetchMock);
    const res = await lookupTweet(cold.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`/v1/x/post/${cold.id}[?]enrich=1$`));
    expect(res.ok && res.value).toMatchObject({ id: cold.id, text: 'a post nobody has shown yet' });
  });

  it('turns a 404 into tweet_not_found and a 503 into x_feed_unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { code: 'x_post_not_found', message: 'nope' } }, 404)),
    );
    const missing = await lookupTweet('1800000000000000555');
    expect(!missing.ok && missing.error.code).toBe('tweet_not_found');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { code: 'x_feed_unavailable', message: 'down' } }, 503)),
    );
    const down = await lookupTweet('1800000000000000556');
    expect(!down.ok && down.error).toMatchObject({
      code: 'x_feed_unavailable',
      message: 'X feed unavailable, try again.',
    });
  });
});
