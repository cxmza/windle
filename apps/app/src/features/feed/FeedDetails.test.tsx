import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFS_KEY, reloadPrefs } from '@/features/settings/prefs';
import { richPost } from '../tweet/fixtures';
import { clearXPostCache } from '../tweet/x-post-api';
import { FeedRow } from './FeedRow';
import { mapPost } from './live-map';
import { post } from './live-test-support';
import type { FeedTweet } from './types';
import { keepScroll } from './use-keep-scroll';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const live = (n: number): FeedTweet => {
  const t = mapPost(post(n));
  if (!t) throw new Error('post did not map');
  return t;
};

const row = (tweet: FeedTweet) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <FeedRow tweet={tweet} market={undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => clearXPostCache());
afterEach(() => vi.unstubAllGlobals());

describe('feed row details', () => {
  it('fetches nothing until the row is opened, then shows a skeleton and the full post', async () => {
    const tweet = live(21);
    const full = { ...richPost(), id: tweet.id };
    const fetchMock = vi.fn(async () => json(full));
    vi.stubGlobal('fetch', fetchMock);
    row(tweet);
    const toggle = screen.getByRole('button', { name: /Details/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const skeleton = screen.getByRole('status', { name: 'Fetching the tweet' });
    expect(skeleton.querySelector('.rounded-full')).toBeNull();
    await waitFor(() => expect(document.querySelector('[data-tweet-view] [data-metrics]')).toBeInTheDocument());
    const panel = document.querySelector('[data-feed-details]') as HTMLElement;
    expect(panel.querySelector('header')).toBeNull();
    expect(panel.querySelector('[data-tweet-text]')).toBeNull();
    expect(panel.querySelector('[data-tweet-skeleton]')).toBeNull();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(`/v1/x/post/${tweet.id}?enrich=1`);
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toBe(
      document.querySelector('[data-feed-details]'),
    );

    fireEvent.click(toggle);
    expect(document.querySelector('[data-feed-details]')).toBeNull();
  });

  it('falls back to the row copy with the reason when X no longer has the post', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { code: 'x_post_not_found', message: 'gone' } }, 404)),
    );
    row(live(22));
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(await screen.findByText(/X no longer returns this post/)).toBeInTheDocument();
    expect(document.querySelector('[data-feed-details] [data-tweet-view]')).toBeInTheDocument();
  });

  it('in Smooth mode keeps the panel until its height has eased shut, and reopens it mid-way', () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ feedMotion: 'smooth' }));
    reloadPrefs();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Promise<Response>(() => {})),
      );
      row(live(25));
      const toggle = screen.getByRole('button', { name: /Details/ });
      fireEvent.click(toggle);
      const panel = document.querySelector<HTMLElement>('[data-feed-details]');
      expect(panel).toHaveAttribute('data-feed-details', 'expand');
      expect(panel).toHaveAttribute('data-open');

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(panel).not.toHaveAttribute('data-open');
      expect(panel).toHaveAttribute('inert');

      fireEvent.click(toggle);
      expect(document.querySelector('[data-feed-details]')).toBe(panel);
      expect(panel).toHaveAttribute('data-open');

      fireEvent.click(toggle);
      fireEvent.transitionEnd(panel as HTMLElement, { propertyName: 'grid-template-rows' });
      expect(document.querySelector('[data-feed-details]')).toBeNull();
    } finally {
      window.localStorage.removeItem(PREFS_KEY);
      reloadPrefs();
    }
  });

  it('does not offer details on a deleted row', () => {
    const t = live(23);
    row(t.feed ? { ...t, feed: { ...t.feed, deleted: true } } : t);
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
  });
});

describe('keepScroll', () => {
  const rect = (top: number) => ({ top }) as DOMRect;

  it('moves the scroller by the growth of a block that starts above the visible top', () => {
    const scroller = document.createElement('div');
    const block = document.createElement('div');
    scroller.scrollTop = 500;
    scroller.getBoundingClientRect = () => rect(100);
    block.getBoundingClientRect = () => rect(-300);
    keepScroll(block, scroller, 180);
    expect(scroller.scrollTop).toBe(680);
  });

  it('leaves the scroller alone when the block is on screen, so rows above never move', () => {
    const scroller = document.createElement('div');
    const block = document.createElement('div');
    scroller.scrollTop = 500;
    scroller.getBoundingClientRect = () => rect(100);
    block.getBoundingClientRect = () => rect(240);
    keepScroll(block, scroller, 180);
    expect(scroller.scrollTop).toBe(500);
  });
});

describe('growth after the row is open', () => {
  it('keeps what the reader sees in place when the details grow above the viewport', async () => {
    const observers: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Promise<Response>(() => {})),
    );
    const tweet = live(24);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <div data-feed-scroll>
            <FeedRow tweet={tweet} market={undefined} />
          </div>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const scroller = document.querySelector<HTMLElement>('[data-feed-scroll]');
    if (!scroller) throw new Error('no scroller');
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    const panel = document.querySelector<HTMLElement>('[data-feed-details]');
    if (!panel) throw new Error('no panel');
    let height = 100;
    scroller.getBoundingClientRect = () => ({ top: 100, height: 600 }) as DOMRect;
    panel.getBoundingClientRect = () => ({ top: -50, height }) as DOMRect;
    for (const cb of observers) cb();
    scroller.scrollTop = 400;
    height = 460;
    for (const cb of observers) cb();
    expect(scroller.scrollTop).toBe(760);
  });
});
