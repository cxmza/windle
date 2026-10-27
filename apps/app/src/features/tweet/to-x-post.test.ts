import { describe, expect, it } from 'vitest';
import type { FeedTweet } from '../feed/types';
import { toXPost } from './to-x-post';

const stored: FeedTweet = {
  id: '1846811299999999999',
  url: 'https://x.com/a/status/1846811299999999999',
  author: { handle: 'a', name: 'A' },
  text: 'ships soon',
  createdAt: '2026-10-13T11:00:00.000Z',
  capturedAt: '2026-10-13T11:00:05.000Z',
  media: [
    {
      kind: 'video',
      url: 'https://video.twimg.com/a.mp4',
      poster: 'https://pbs.twimg.com/p.jpg',
      width: 1280,
      height: 720,
      durationMs: 9_000,
    },
  ],
  card: {
    kind: 'summary_large_image',
    url: 'https://dexscreener.com/solana/abc',
    domain: 'dexscreener.com',
    title: 'BEPE / SOL',
    description: null,
    imageUrl: null,
  },
  metrics: { replies: 1, reposts: 2, quotes: 0, likes: 30, bookmarks: null, views: 4000 },
};

describe('toXPost', () => {
  it('gives back the card, the counts and the media sizes a stored copy holds, so the page has its shape at once', () => {
    const post = toXPost(stored);
    expect(post.card?.title).toBe('BEPE / SOL');
    expect(post.metrics?.likes).toBe(30);
    expect(post.media[0]).toMatchObject({
      type: 'video',
      width: 1280,
      height: 720,
      posterUrl: 'https://pbs.twimg.com/p.jpg',
    });
  });

  it('leaves them out for an older copy that has none', () => {
    const { card: _card, metrics: _metrics, ...old } = stored;
    const post = toXPost(old);
    expect(post.card).toBeUndefined();
    expect(post.metrics).toBeUndefined();
  });
});
