import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { lookupTweet } from '../predict/tweets';
import { FeedRow, signalChips } from './FeedRow';
import { mapPost } from './live-map';
import { post } from './live-test-support';
import { clearFeedRegistry, registerFeedTweets } from './registry';
import type { FeedTweet } from './types';

const IMG = 'https://pbs.twimg.com/media/a.jpg';
const VIDEO = 'https://video.twimg.com/tweet_video/a.mp4';
const ORIGINAL_ID = '2102711550079631790';

const live = (n: number, over: Parameters<typeof post>[1] = {}): FeedTweet => {
  const t = mapPost(post(n, over));
  if (!t) throw new Error('post did not map');
  return t;
};

const row = (tweet: FeedTweet) =>
  render(
    <MemoryRouter>
      <FeedRow tweet={tweet} market={undefined} />
    </MemoryRouter>,
  );

describe('FeedRow with a live post', () => {
  beforeEach(() => clearFeedRegistry());

  it('shows the avatar with the safe image attributes and falls back to the monogram on error', () => {
    const { container } = row(live(1));
    const img = container.querySelector('[data-feed-avatar] img');
    expect(img).toHaveAttribute('src', 'https://pbs.twimg.com/profile_images/1/alice_normal.jpg');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    if (img) fireEvent.error(img);
    expect(container.querySelector('[data-feed-avatar] img')).toBeNull();
    expect(container.querySelector('[data-feed-avatar]')).toHaveTextContent('A');
  });

  it('reserves a fixed 16:9 media box that survives an image error', () => {
    const { container } = row(live(2, { media: [{ type: 'image', url: IMG }] }));
    const box = container.querySelector('[data-feed-media]');
    expect(box).toHaveClass('aspect-video', 'w-full');
    const img = box?.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveClass('absolute', 'object-cover');
    if (img) fireEvent.error(img);
    expect(container.querySelector('[data-feed-media]')).toBe(box);
    expect(box).toHaveClass('aspect-video', 'w-full');
    expect(box?.querySelector('img')).toBeNull();
  });

  it('shows a video by its poster with the play badge', () => {
    const { container } = row(live(3, { media: [{ type: 'video', url: VIDEO, posterUrl: IMG }] }));
    const box = container.querySelector('[data-feed-media]');
    expect(box?.querySelector('img')).toHaveAttribute('src', IMG);
    expect(box).not.toHaveAttribute('data-media-placeholder');
    expect(box?.querySelector('[data-media-play]')).toBeInTheDocument();
  });

  it('keeps the reserved box as a placeholder for a video without a poster, never an <img> of the file', () => {
    const { container } = row(live(3, { media: [{ type: 'gif', url: VIDEO }] }));
    const box = container.querySelector('[data-feed-media]');
    expect(box).toHaveClass('aspect-video', 'w-full');
    expect(box).toHaveAttribute('data-media-placeholder');
    expect(box?.querySelector('img')).toBeNull();
    expect(box?.querySelector('[data-media-play]')).toBeInTheDocument();
  });

  it('shows a repost as the original under a reposted line, and makes the market from the original', () => {
    const t = live(10, {
      kind: 'repost',
      text: '',
      quoted: {
        id: ORIGINAL_ID,
        author: { handle: 'carol', name: 'Carol', avatarUrl: null },
        text: 'the original',
        media: [],
      },
    });
    const { container } = row(t);
    expect(container.querySelector('[data-feed-repost]')).toHaveTextContent('↻ @alice reposted');
    expect(screen.getByRole('article')).toHaveAccessibleName(/@alice reposted Carol the original/);
    expect(container.querySelector('[data-feed-quote]')).toBeNull();
    expect(screen.queryByText('Repost')).toBeNull();
    expect(screen.getByRole('link', { name: 'Create market' })).toHaveAttribute(
      'href',
      `/create?tweet=${encodeURIComponent(`https://x.com/carol/status/${ORIGINAL_ID}`)}`,
    );
  });

  it('hides Create market on a repost whose original id is unknown', () => {
    row(
      live(11, {
        kind: 'repost',
        text: '',
        quoted: {
          id: null,
          author: { handle: 'carol', name: 'Carol', avatarUrl: null },
          text: 'the original',
          media: [],
        },
      }),
    );
    expect(screen.getByText('the original')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create market' })).toBeNull();
  });

  it('renders a post without media with no media box', () => {
    const { container } = row(live(4));
    expect(container.querySelector('[data-feed-media]')).toBeNull();
  });

  it('shows the reply line, kind badge, author tag and the quoted block', () => {
    const { container } = row(
      live(5, {
        kind: 'quote',
        inReplyTo: { id: null, handle: 'bob' },
        author: { ...post(5).author, tags: ['founder'] },
        quoted: {
          id: '9',
          author: { handle: 'carol', name: 'Carol', avatarUrl: null },
          text: 'the original',
          media: [],
        },
      }),
    );
    expect(container.querySelector('[data-feed-reply]')).toHaveTextContent('Replying to @bob');
    expect(screen.getByText('Quote')).toBeInTheDocument();
    expect(screen.getByText('Founder')).toBeInTheDocument();
    expect(container.querySelector('[data-feed-quote]')).toHaveTextContent('the original');
  });

  it('links Create market to the tweet url', () => {
    const t = live(6);
    row(t);
    expect(screen.getByRole('link', { name: 'Create market' })).toHaveAttribute(
      'href',
      `/create?tweet=${encodeURIComponent(t.url)}`,
    );
  });

  it('keeps a deleted row in place, marked, without a create action', () => {
    const t = live(7);
    const { container } = row({ ...t, feed: t.feed && { ...t.feed, deleted: true } });
    expect(container.querySelector('[data-feed-row]')).toHaveAttribute('data-deleted');
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create market' })).toBeNull();
  });
});

describe('FeedRow signals and loading', () => {
  const withSignals = (n: number, signals: string[] | undefined, text: string): FeedTweet => {
    const t = live(n, { text });
    return t.feed && signals ? { ...t, feed: { ...t.feed, signals } } : t;
  };

  it('shows a contract-address chip and the cashtag the text carries', () => {
    row(withSignals(1, ['cashtag', 'ca_sol'], 'gm $BONK is live'));
    expect(screen.getByText('CA')).toBeInTheDocument();
    expect(screen.getByText('$BONK', { selector: '[data-feed-signal]' })).toBeInTheDocument();
  });

  it('shows no chip for link or keyword signals or when the payload has no signals', () => {
    expect(signalChips(['link', 'keyword'], 'x')).toEqual([]);
    expect(signalChips(undefined, 'x $ABC')).toEqual([]);
    const { container } = row(withSignals(2, undefined, 'plain'));
    expect(container.querySelector('[data-feed-signal]')).toBeNull();
  });

  it('loads images eagerly only when the row is one of the first', () => {
    const t = live(3, { media: [{ type: 'image', url: IMG }] });
    const { container, rerender } = render(
      <MemoryRouter>
        <FeedRow tweet={t} market={undefined} eager />
      </MemoryRouter>,
    );
    const imgs = () => [...container.querySelectorAll('img')];
    expect(imgs().length).toBeGreaterThan(1);
    expect(imgs().every((i) => i.getAttribute('loading') === 'eager')).toBe(true);
    rerender(
      <MemoryRouter>
        <FeedRow tweet={t} market={undefined} />
      </MemoryRouter>,
    );
    expect(imgs().every((i) => i.getAttribute('loading') === 'lazy')).toBe(true);
  });

  it('fades an image in once it has loaded', () => {
    const { container } = row(live(4));
    const img = container.querySelector('[data-feed-avatar] img');
    expect(img).not.toHaveAttribute('data-loaded');
    if (img) fireEvent.load(img);
    expect(img).toHaveAttribute('data-loaded');
  });
});

describe('create wizard lookup', () => {
  beforeEach(() => clearFeedRegistry());

  it('resolves the original of a registered repost by its id', async () => {
    registerFeedTweets([
      live(12, {
        kind: 'repost',
        text: '',
        quoted: {
          id: ORIGINAL_ID,
          author: { handle: 'carol', name: 'Carol', avatarUrl: null },
          text: 'orig',
          media: [],
        },
      }),
    ]);
    const res = await lookupTweet(ORIGINAL_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toMatchObject({ id: ORIGINAL_ID, author: { handle: 'carol' }, text: 'orig' });
  });

  it('resolves a registered live tweet by id', async () => {
    const t = live(8);
    registerFeedTweets([t]);
    const res = await lookupTweet(t.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toMatchObject({ id: t.id, author: { handle: 'alice' }, text: t.text });
  });
});
