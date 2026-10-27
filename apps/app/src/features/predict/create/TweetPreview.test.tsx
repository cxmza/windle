import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TweetSnapshot, XPost } from '@windle/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { richPost } from '../../tweet/fixtures';
import { clearXPostCache } from '../../tweet/x-post-api';
import { TweetPreview } from './TweetPreview';

const ID = '1800000000000000777';

const snapshot: TweetSnapshot = {
  id: ID,
  url: `https://x.com/glowbyte_sol/status/${ID}`,
  author: { handle: 'glowbyte_sol', name: 'Glowbyte' },
  text: 'Saved copy of the tweet',
  createdAt: '2026-10-13T11:00:00.000Z',
  capturedAt: '2026-10-13T11:30:00.000Z',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const err = (code: string) => ({ error: { code, message: code } });

const rich = (over: Partial<XPost> = {}): XPost => ({
  ...richPost(),
  id: ID,
  enrichedAt: new Date().toISOString(),
  ...over,
});

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TweetPreview tweet={snapshot} />
    </QueryClientProvider>,
  );

beforeEach(() => clearXPostCache());
afterEach(() => vi.unstubAllGlobals());

describe('wizard tweet preview', () => {
  it('holds the place with a skeleton while X answers', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    show();
    expect(screen.getByRole('status', { name: 'Fetching the tweet' })).toBeInTheDocument();
  });

  it('shows the rich post with a "Verified on X" row: the author check mark and when it was fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(rich())),
    );
    show();
    const row = await screen.findByText('Verified on X');
    const panel = row.closest('[data-verified-on-x]') as HTMLElement;
    expect(panel).toHaveTextContent('@glowbyte_sol');
    expect(panel).toHaveTextContent('Blue check');
    expect(panel).toHaveTextContent(/Fetched from X · (just now|\d+s ago)/);
    expect(document.querySelector('[data-metrics]')).toBeInTheDocument();
    expect(document.querySelector('[data-link-card]')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-fetched]')).toHaveLength(0);
  });

  it('says so and keeps what the feed saw when enrichment is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('?enrich=1')
          ? json(err('x_enrich_unavailable'), 503)
          : json(rich({ source: 'gmgn', enrichedAt: null })),
      ),
    );
    show();
    expect(await screen.findByText('Showing the feed copy of this tweet.')).toBeInTheDocument();
    expect(screen.queryByText('Verified on X')).toBeNull();
    expect(document.querySelector('[data-tweet-view]')).toBeInTheDocument();
  });

  it('explains a tweet X no longer returns and still shows the saved copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(err('x_post_not_found'), 404)),
    );
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('X no longer returns this tweet.');
    expect(screen.getByText('Saved copy of the tweet')).toBeInTheDocument();
  });

  it('explains rate limiting and offers a retry that asks again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(err('rate_limited'), 429, { 'retry-after': '5' }))
      .mockResolvedValueOnce(json(rich()));
    vi.stubGlobal('fetch', fetchMock);
    show();
    expect(await screen.findByText('X is rate limiting lookups.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Verified on X')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the saved copy when X cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    show();
    expect(await screen.findByText('Could not verify this tweet on X right now.')).toBeInTheDocument();
    expect(screen.getByText('Saved copy of the tweet')).toBeInTheDocument();
  });
});
