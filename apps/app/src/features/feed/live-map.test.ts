import { TweetSnapshot, type XQuoted } from '@windle/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { mapPost, parseDeleted, parsePost, parseSnapshot } from './live-map';
import { post } from './live-test-support';
import { clearFeedRegistry, feedTweets, registerFeedTweets } from './registry';
import { sourceTweet } from './types';

const IMG = 'https://pbs.twimg.com/media/a.jpg';
const VIDEO = 'https://video.twimg.com/amplify_video/1/vid/avc1/480x270/a.mp4?tag=16';
const POSTER = 'https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg';
const ORIGINAL_ID = '2102711550079631790';

const repost = (n: number, quoted: XQuoted | null) =>
  post(n, { kind: 'repost', text: '', media: [], url: `https://x.com/alice/status/${post(n).id}`, quoted });

describe('mapPost', () => {
  beforeEach(() => clearFeedRegistry());

  it('maps author, avatar, kind, tags and capture time', () => {
    const t = mapPost(post(1, { kind: 'reply', inReplyTo: { id: '5', handle: 'bob' } }));
    expect(t).toMatchObject({
      author: { handle: 'alice', name: 'Alice', avatarUrl: 'https://pbs.twimg.com/profile_images/1/alice_normal.jpg' },
      capturedAt: post(1).receivedAt,
      feed: { kind: 'reply', tags: ['kol'], replyTo: 'bob', quoted: null, repost: null, deleted: false },
    });
    expect(t?.media).toBeUndefined();
  });

  it('maps images, videos and gifs, and shows a video by its poster, never by its file', () => {
    const t = mapPost(
      post(2, {
        media: [
          { type: 'image', url: IMG },
          { type: 'video', url: VIDEO, posterUrl: POSTER },
          { type: 'gif', url: 'https://video.twimg.com/tweet_video/c.mp4', posterUrl: null },
          { type: 'video', url: VIDEO },
        ],
      }),
    );
    expect(t?.media).toEqual([
      { kind: 'image', url: IMG },
      { kind: 'video', url: VIDEO, poster: POSTER },
      { kind: 'video', url: 'https://video.twimg.com/tweet_video/c.mp4', gif: true },
      { kind: 'video', url: VIDEO },
    ]);
  });

  it('keeps what the page needs to take its final shape in the snapshot: poster, sizes, files, card and counts', () => {
    const card = {
      kind: 'summary_large_image' as const,
      url: 'https://dexscreener.com/solana/abc',
      domain: 'dexscreener.com',
      title: 'BEPE / SOL',
      description: null,
      imageUrl: null,
    };
    const metrics = { replies: 1, reposts: 2, quotes: 0, likes: 30, bookmarks: null, views: 4000 };
    const variants = [{ url: 'https://video.twimg.com/hi.mp4', contentType: 'video/mp4', bitrate: 2_176_000 }];
    const t = mapPost(
      post(9, {
        card,
        metrics,
        media: [
          {
            type: 'video',
            url: VIDEO,
            posterUrl: POSTER,
            width: 1280,
            height: 720,
            durationMs: 42_000,
            variants,
          },
        ],
      }),
    );
    registerFeedTweets(t ? [t] : []);
    const stored = feedTweets(0).find((s) => s.id === post(9).id);
    expect(stored?.media).toEqual([
      { kind: 'video', url: VIDEO, poster: POSTER, width: 1280, height: 720, durationMs: 42_000, variants },
    ]);
    expect(stored?.card).toEqual(card);
    expect(stored?.metrics).toEqual(metrics);
    expect(TweetSnapshot.safeParse(stored).success).toBe(true);
  });

  it('maps a quoted post with its link', () => {
    const t = mapPost(
      post(3, {
        kind: 'quote',
        quoted: { id: '99', author: { handle: 'bob', name: 'Bob', avatarUrl: null }, text: 'original', media: [] },
      }),
    );
    expect(t?.feed?.quoted).toMatchObject({
      handle: 'bob',
      avatarUrl: undefined,
      text: 'original',
      url: 'https://x.com/bob/status/99',
    });
  });

  it('keeps a media-only post readable and drops an empty one', () => {
    expect(mapPost(post(4, { text: '', media: [{ type: 'image', url: IMG }] }))?.text).toBe('Media post');
    expect(mapPost(post(5, { text: '  ' }))).toBeNull();
  });
});

describe('mapPost with a repost', () => {
  beforeEach(() => clearFeedRegistry());

  const original: XQuoted = {
    id: ORIGINAL_ID,
    author: {
      handle: 'TheWorldWar12',
      name: 'The World War',
      avatarUrl: 'https://pbs.twimg.com/profile_images/2/w.jpg',
    },
    text: '#BREAKING original text',
    media: [{ type: 'video', url: VIDEO, posterUrl: POSTER }],
  };

  it('shows the original author, text and media under the reposter, keeping the row id', () => {
    const t = mapPost(repost(1, original));
    expect(t).toMatchObject({
      id: post(1).id,
      url: `https://x.com/TheWorldWar12/status/${ORIGINAL_ID}`,
      author: {
        handle: 'TheWorldWar12',
        name: 'The World War',
        avatarUrl: 'https://pbs.twimg.com/profile_images/2/w.jpg',
      },
      text: '#BREAKING original text',
      media: [{ kind: 'video', url: VIDEO, poster: POSTER }],
      createdAt: post(1).createdAt,
      feed: { kind: 'repost', quoted: null, repost: { by: { handle: 'alice', name: 'Alice' } } },
    });
  });

  it('makes a market from the original tweet, with its own id, author and time', () => {
    const t = mapPost(repost(2, original));
    if (!t) throw new Error('repost dropped');
    const source = sourceTweet(t);
    expect(source).toMatchObject({
      id: ORIGINAL_ID,
      url: `https://x.com/TheWorldWar12/status/${ORIGINAL_ID}`,
      author: { handle: 'TheWorldWar12' },
      text: '#BREAKING original text',
      createdAt: '2026-09-23T10:47:54.687Z',
      media: [{ kind: 'video', url: VIDEO }],
    });
    registerFeedTweets([t]);
    const known = feedTweets(0).map((s) => s.id);
    expect(known).toContain(ORIGINAL_ID);
    expect(known).not.toContain(t.id);
  });

  it('keeps a repost whose original has no id, without a market source', () => {
    const t = mapPost(repost(3, { ...original, id: null }));
    expect(t?.text).toBe('#BREAKING original text');
    expect(t?.url).toBe(post(3).url);
    expect(t && sourceTweet(t)).toBeNull();
  });

  it('keeps a media-only original and drops a repost with nothing to show', () => {
    expect(mapPost(repost(4, { ...original, text: '' }))?.text).toBe('Media post');
    expect(mapPost(repost(5, { ...original, text: ' ', media: [] }))).toBeNull();
    expect(mapPost(repost(6, null))).toBeNull();
  });
});

describe('parsing', () => {
  it('drops invalid posts one by one', () => {
    const out = parseSnapshot(JSON.stringify({ posts: [post(1), { id: 'x' }, post(2)] }));
    expect(out?.map((t) => t.id)).toEqual([post(1).id, post(2).id]);
  });

  it('rejects garbage payloads', () => {
    expect(parseSnapshot('not json')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ nope: 1 }))).toBeNull();
    expect(parsePost('{"id":1}')).toBeNull();
    expect(parsePost(undefined)).toBeNull();
    expect(parseDeleted('{}')).toBeNull();
    expect(parseDeleted('{"id":"7"}')).toBe('7');
  });
});

describe('signals', () => {
  it('carries the relay signals on a post and on snapshot entries, and tolerates their absence', () => {
    const withSignals = { ...post(1), signals: ['cashtag', 'ca_sol'] };
    expect(parsePost(JSON.stringify(withSignals))?.feed?.signals).toEqual(['cashtag', 'ca_sol']);
    const snap = parseSnapshot(JSON.stringify({ posts: [withSignals, post(2)] }));
    expect(snap?.[0]?.feed?.signals).toEqual(['cashtag', 'ca_sol']);
    expect(snap?.[1]?.feed?.signals).toBeUndefined();
  });
});
