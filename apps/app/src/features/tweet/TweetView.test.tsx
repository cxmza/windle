import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { XMedia } from '@windle/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerTime } from '@/lib/server-time';
import { FIXTURE_NOW, image, pollPost, quotePost, richPost, videoPost, xpost } from './fixtures';
import { TweetSkeleton, TweetView } from './TweetView';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(FIXTURE_NOW);
  resetServerTime();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const view = (post = richPost()) => render(<TweetView post={post} />);

describe('header', () => {
  it.each([
    ['blue', 'Verified account'],
    ['business', 'Verified business account'],
    ['government', 'Verified government account'],
  ] as const)('draws the %s check mark with its own label', (verified, label) => {
    const post = xpost();
    render(<TweetView post={{ ...post, author: { ...post.author, verified } }} />);
    const badge = screen.getByRole('img', { name: label });
    expect(badge).toHaveAttribute('data-verified', verified);
  });

  it('draws no check mark for an unverified account', () => {
    const post = xpost();
    render(<TweetView post={{ ...post, author: { ...post.author, verified: 'none' } }} />);
    expect(screen.queryByRole('img', { name: /Verified/ })).toBeNull();
  });

  it('shows the affiliate badge with its tooltip, the labels, the handle and the edited marker', () => {
    const post = richPost();
    render(<TweetView post={{ ...post, author: { ...post.author, automated: true, parody: true } }} />);
    expect(screen.getByLabelText('Affiliated with Solana')).toHaveAttribute('href', 'https://x.com/solana');
    expect(screen.getByText('Automated')).toBeInTheDocument();
    expect(screen.getByText('Parody')).toBeInTheDocument();
    expect(screen.getByText('@glowbyte_sol')).toBeInTheDocument();
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('puts the exact time in a <time> element', () => {
    view(xpost({ createdAt: '2026-10-13T11:59:48.000Z' }));
    const time = screen.getByText('12s');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-10-13T11:59:48.000Z');
    expect(time.getAttribute('title')).toContain('Oct 13, 2026');
  });
});

function overflow(over: boolean) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(over ? 240 : 120);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120);
}

describe('text', () => {
  it('shows the real address of a t.co link and links to it, links mentions, hashtags and cashtags, drops the media link', () => {
    view();
    const link = screen.getByRole('link', { name: 'glowbyte.xyz/launchpad' });
    expect(link).toHaveAttribute('href', 'https://glowbyte.xyz/launchpad');
    expect(screen.getByRole('link', { name: '@solana' })).toHaveAttribute('href', 'https://x.com/solana');
    expect(screen.getByRole('link', { name: '#builders' })).toHaveAttribute('href', 'https://x.com/hashtag/builders');
    expect(screen.getByRole('link', { name: '$GLOW' }).getAttribute('href')).toContain('https://x.com/search?q=');
    expect(screen.queryByText(/t\.co/)).toBeNull();
  });

  it('keeps line breaks and takes lang and direction from the post', () => {
    view(xpost({ text: 'one\ntwo', lang: 'ar' }));
    const p = document.querySelector('[data-tweet-text]');
    expect(p).toHaveAttribute('lang', 'ar');
    expect(p).toHaveAttribute('dir', 'auto');
    expect(p?.className).toContain('whitespace-pre-wrap');
    expect(p?.textContent).toBe('one\ntwo');
  });

  it('clamps long text behind "Show more"', () => {
    overflow(true);
    view(xpost({ text: 'long '.repeat(120) }));
    const p = document.querySelector('[data-tweet-text]');
    expect(p?.className).toContain('line-clamp-8');
    const button = screen.getByRole('button', { name: 'Show more' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(p?.className).not.toContain('line-clamp-8');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('has no "Show more" for short text', () => {
    overflow(false);
    view(xpost({ text: 'short' }));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('has no "Show more" when a long text still fits the clamp, and none for few characters that overflow it', () => {
    overflow(false);
    view(xpost({ text: 'long '.repeat(120) }));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    cleanup();
    overflow(true);
    view(xpost({ text: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n') }));
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });
});

describe('media layouts', () => {
  const cells = (n: number): XMedia[] => Array.from({ length: n }, (_, i) => image(i + 1));

  it('lays out one item at its own proportions, capped', () => {
    view(xpost({ media: [image(1, { width: 1000, height: 500 })] }));
    const grid = document.querySelector<HTMLElement>('[data-media-grid]');
    expect(grid?.dataset.count).toBe('1');
    expect(grid?.dataset.ratio).toBe('2');
  });

  it('caps a very tall image', () => {
    view(xpost({ media: [image(1, { width: 500, height: 2000 })] }));
    expect(document.querySelector<HTMLElement>('[data-media-grid]')?.dataset.ratio).toBe('0.8');
  });

  it('reserves 16:9 and shows the whole image when its size is not known', () => {
    view(xpost({ media: [{ type: 'image', url: image(1).url }] }));
    const grid = document.querySelector<HTMLElement>('[data-media-grid]');
    expect(Number(grid?.dataset.ratio)).toBeCloseTo(16 / 9, 3);
    expect(within(grid as HTMLElement).getByRole('img').className).toContain('object-contain');
  });

  it.each([
    [2, 'grid-cols-2', 0],
    [3, 'grid-cols-2 grid-rows-2', 1],
    [4, 'grid-cols-2 grid-rows-2', 0],
  ])('lays out %i items as X does', (n, layout, spans) => {
    view(xpost({ media: cells(n) }));
    const grid = document.querySelector<HTMLElement>('[data-media-grid]');
    expect(grid?.dataset.count).toBe(String(n));
    expect(Number(grid?.dataset.ratio)).toBeCloseTo(16 / 9, 3);
    expect(grid?.firstElementChild?.className).toContain(layout);
    expect(grid?.querySelectorAll('[data-media-cell]')).toHaveLength(n);
    expect(grid?.querySelectorAll('.row-span-2')).toHaveLength(spans);
  });

  it('draws at most four', () => {
    view(xpost({ media: cells(6) }));
    expect(document.querySelectorAll('[data-media-cell]')).toHaveLength(4);
  });

  it('shows an ALT badge that opens the description', async () => {
    vi.useRealTimers();
    view(xpost({ media: [image(1, { altText: 'A chart going up' })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Show image description' }));
    expect(await screen.findByText('A chart going up')).toBeInTheDocument();
  });

  it('keeps the box and shows a neutral mark when an image fails', () => {
    view(xpost({ media: [image(1)] }));
    fireEvent.error(within(document.querySelector('[data-media-grid]') as HTMLElement).getByRole('img'));
    expect(document.querySelector('[data-image-fallback]')).toBeInTheDocument();
    expect(document.querySelector('[data-media-grid]')).toBeInTheDocument();
  });

  it('blurs possibly sensitive media until the viewer asks', () => {
    view(xpost({ media: [image(1)], possiblySensitive: true }));
    const grid = document.querySelector<HTMLElement>('[data-media-grid]');
    expect(grid).toHaveAttribute('data-sensitive');
    expect(grid?.querySelector('[inert]')?.className).toContain('blur');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(grid).not.toHaveAttribute('data-sensitive');
    expect(grid?.querySelector('[inert]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
  });
});

function stubMedia(matches: (q: string) => boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('video and gif', () => {
  it('plays the best mp4 inline with controls, no preload, muted, poster behind and the duration', () => {
    stubMedia(() => false);
    view(videoPost());
    const video = document.querySelector<HTMLVideoElement>('video[data-video]');
    expect(video?.getAttribute('src')).toBe('https://video.twimg.com/hi.mp4');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('preload', 'none');
    expect(video?.muted).toBe(true);
    expect(screen.getByText('0:42')).toBeInTheDocument();
  });

  it('hands the still frame to the video as its poster, with nothing painted over it', () => {
    stubMedia(() => false);
    const post = videoPost();
    view(post);
    const video = document.querySelector<HTMLVideoElement>('video[data-video]');
    expect(video).toHaveAttribute('poster', post.media[0]?.posterUrl);
    expect(document.querySelector('[data-media-grid] img')).toBeNull();
    expect(document.querySelector('[data-media-grid]')).toHaveAttribute('data-ratio', String(1280 / 720));
  });

  it('puts the duration at the top left and takes it away once playback starts', () => {
    stubMedia(() => false);
    view(videoPost());
    const badge = document.querySelector('[data-duration]');
    expect(badge?.className).toContain('top-1.5');
    expect(badge?.className).not.toContain('bottom-1.5');
    fireEvent.play(document.querySelector('video[data-video]') as HTMLVideoElement);
    expect(document.querySelector('[data-duration]')).toBeNull();
  });

  it('tries the next file when one fails to load, then links to the post when none is left', () => {
    stubMedia(() => false);
    const post = videoPost();
    view(post);
    const video = () => document.querySelector<HTMLVideoElement>('video[data-video]');
    expect(video()?.getAttribute('src')).toBe('https://video.twimg.com/hi.mp4');
    fireEvent.error(video() as HTMLVideoElement);
    expect(video()?.getAttribute('src')).toBe('https://video.twimg.com/mid.mp4');
    fireEvent.error(video() as HTMLVideoElement);
    expect(video()?.getAttribute('src')).toBe('https://video.twimg.com/low.mp4');
    fireEvent.error(video() as HTMLVideoElement);
    expect(video()).toBeNull();
    const link = screen.getByRole('link', { name: /Watch on X/ });
    expect(link).toHaveAttribute('href', post.url);
    expect(link.closest('[data-media-unplayable]')).not.toBeNull();
  });

  it('carries on playing the next file when somebody had already pressed play', () => {
    stubMedia(() => false);
    const play = vi.fn(async () => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    view(videoPost());
    const first = document.querySelector('video[data-video]') as HTMLVideoElement;
    fireEvent.play(first);
    fireEvent.error(first);
    expect(play).toHaveBeenCalledOnce();
  });

  it('turns a failing gif into the link as well', () => {
    stubMedia(() => false);
    view(gif());
    const video = document.querySelector('video[data-gif]') as HTMLVideoElement;
    expect(video).toHaveAttribute('poster', image(5).url);
    fireEvent.error(video);
    expect(screen.getByRole('link', { name: /Watch on X/ })).toBeInTheDocument();
  });

  it('picks a lighter file on a small screen', () => {
    stubMedia((q) => q.includes('max-width'));
    view(videoPost());
    expect(document.querySelector('video[data-video]')?.getAttribute('src')).toBe('https://video.twimg.com/mid.mp4');
  });

  it('falls back to a link to X when nothing can play inline', () => {
    stubMedia(() => false);
    const post = videoPost();
    view({ ...post, media: post.media.map((m) => ({ ...m, variants: [], url: 'https://video.twimg.com/x.m3u8' })) });
    expect(screen.getByRole('link', { name: /Watch on X/ })).toHaveAttribute('href', post.url);
  });

  const gif = () =>
    xpost({
      media: [
        {
          type: 'gif',
          url: 'https://video.twimg.com/tweet_video/g.mp4',
          posterUrl: image(5).url,
          width: 480,
          height: 270,
        },
      ],
    });

  it('loops a gif on its own, silently', () => {
    stubMedia(() => false);
    view(gif());
    const video = document.querySelector<HTMLVideoElement>('video[data-gif]');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('loop');
    expect(video?.muted).toBe(true);
    expect(screen.getByText('GIF')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play GIF' })).toBeNull();
  });

  it('holds a gif still under reduced motion until it is pressed', () => {
    stubMedia((q) => q.includes('prefers-reduced-motion'));
    const play = vi.fn(async () => {});
    const pause = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
    view(gif());
    const video = document.querySelector<HTMLVideoElement>('video[data-gif]');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('preload', 'none');
    fireEvent.click(screen.getByRole('button', { name: 'Play GIF' }));
    expect(play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Pause GIF' }));
    expect(pause).toHaveBeenCalledOnce();
  });
});

describe('link card', () => {
  const card = (kind: 'summary' | 'summary_large_image' | 'player', imageUrl: string | null) =>
    xpost({
      card: {
        kind,
        url: 'https://dexscreener.com/solana/abc',
        domain: 'dexscreener.com',
        title: 'BEPE / SOL',
        description: 'Live chart',
        imageUrl,
      },
    });

  it('draws a large image card with its image box reserved by ratio, linked as a whole', () => {
    view(card('summary_large_image', 'https://pbs.twimg.com/card/1.jpg'));
    const link = document.querySelector('[data-link-card="summary_large_image"]');
    expect(link).toHaveAttribute('href', 'https://dexscreener.com/solana/abc');
    expect(link?.querySelector('[data-card-image]')?.className).toContain('aspect-[1.91/1]');
    expect(within(link as HTMLElement).queryByRole('link')).toBeNull();
    expect(screen.getByText('dexscreener.com')).toBeInTheDocument();
    expect(screen.getByText('BEPE / SOL')).toBeInTheDocument();
  });

  it('draws a summary with the thumbnail beside the text', () => {
    view(card('summary', 'https://pbs.twimg.com/card/2.jpg'));
    const link = document.querySelector('[data-link-card="summary"]');
    expect(link?.querySelector('[data-card-image]')?.className).toContain('size-24');
    expect(link?.querySelector('[data-card-image]')?.className).not.toContain('aspect-');
  });

  it('puts a play badge on a player card', () => {
    view(card('player', 'https://pbs.twimg.com/card/3.jpg'));
    expect(document.querySelector('[data-card-play]')).toBeInTheDocument();
  });

  it('draws text only when there is no image', () => {
    view(card('summary_large_image', null));
    expect(document.querySelector('[data-card-image]')).toBeNull();
    expect(screen.getByText('BEPE / SOL')).toBeInTheDocument();
  });
});

describe('poll', () => {
  it('shows percentages, the total and the time left of an open poll, with no winner', () => {
    view(pollPost(false));
    const options = document.querySelectorAll('[data-poll-option]');
    expect(options).toHaveLength(3);
    expect(options[0]?.textContent).toContain('62%');
    expect(document.querySelector('[data-winner]')).toBeNull();
    expect(screen.getByText('1K votes')).toBeInTheDocument();
    expect(screen.getByText('Ends in 3h')).toBeInTheDocument();
  });

  it('marks the winner of a closed poll and says the results are final', () => {
    view(pollPost(true));
    const winner = document.querySelector('[data-winner]');
    expect(winner?.textContent).toContain('Solana');
    expect(screen.getByText('Final results')).toBeInTheDocument();
  });

  it('counts down on the shared clock', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(FIXTURE_NOW);
    view(pollPost(false));
    expect(screen.getByText('Ends in 3h')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Ends in 2h 59m')).toBeInTheDocument();
  });
});

describe('article, note, quote, repost, reply, thread', () => {
  it('draws an article card', () => {
    view(
      xpost({
        article: {
          title: 'How launches work',
          previewText: 'A long read',
          coverUrl: 'https://pbs.twimg.com/a.jpg',
          url: 'https://x.com/i/article/1',
        },
      }),
    );
    const a = screen.getByRole('link', { name: 'Article: How launches work' });
    expect(a).toHaveAttribute('href', 'https://x.com/i/article/1');
    expect(screen.getByText('A long read')).toBeInTheDocument();
  });

  it('draws a community note with a link to learn more', () => {
    view(xpost({ communityNote: { text: 'The date is wrong.', url: 'https://x.com/i/birdwatch/n/1' } }));
    expect(screen.getByText('Readers added context')).toBeInTheDocument();
    expect(screen.getByText('The date is wrong.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Learn more/ })).toHaveAttribute('href', 'https://x.com/i/birdwatch/n/1');
  });

  it('nests a quoted post as one link, with its own check mark and age', () => {
    view(quotePost());
    const q = screen.getByRole('link', { name: 'Quoted post by @fernwave_cto' });
    expect(q).toHaveAttribute('href', 'https://x.com/fernwave_cto/status/1846811200000000200');
    expect(within(q).getByRole('img', { name: 'Verified business account' })).toBeInTheDocument();
    expect(within(q).getByText('2h')).toBeInTheDocument();
    expect(within(q).queryByRole('link')).toBeNull();
  });

  it('shows a repost as its original under a "reposted" line', () => {
    const q = quotePost().quoted;
    view(xpost({ kind: 'repost', text: '', quoted: q, author: { ...xpost().author, handle: 'reposter', name: 'R' } }));
    expect(screen.getByText('reposted').parentElement?.textContent).toContain('@reposter');
    expect(screen.getByText('@fernwave_cto')).toBeInTheDocument();
    expect(screen.getByText('Treasury vote opens Friday.')).toBeInTheDocument();
  });

  it('says who it replies to and links to the thread', () => {
    view(xpost({ inReplyTo: { id: null, handle: 'solana' }, thread: true, conversationId: '1846811200000000001' }));
    expect(screen.getByText(/Replying to/).textContent).toContain('@solana');
    expect(screen.getByRole('link', { name: /Show this thread/ })).toHaveAttribute(
      'href',
      'https://x.com/glowbyte_sol/status/1846811200000000001',
    );
  });
});

describe('metrics and footer', () => {
  it('writes counts compactly and says them in full to a screen reader', () => {
    view();
    const m = document.querySelector('[data-metrics]');
    expect(m?.textContent).toContain('1.2K');
    expect(m?.textContent).toContain('34.5K');
    expect(m?.textContent).toContain('3.4M');
    expect(within(m as HTMLElement).getByText('34,567 likes')).toHaveClass('sr-only');
    expect(m?.querySelector('[data-metric="views"]')).toHaveAttribute('title', '3,400,000 views');
  });

  it('skips a count X did not give', () => {
    const post = richPost();
    view({ ...post, metrics: { replies: 1, reposts: 0, quotes: 0, likes: 2, bookmarks: null, views: null } });
    expect(document.querySelector('[data-metric="views"]')).toBeNull();
    expect(screen.getByText('1 reply')).toBeInTheDocument();
  });

  it('links to the post on X and says when it was fetched', () => {
    view();
    expect(screen.getByRole('link', { name: /View on X/ })).toHaveAttribute(
      'href',
      'https://x.com/glowbyte_sol/status/1846811200000000100',
    );
    expect(document.querySelector('[data-fetched]')?.textContent).toContain('Fetched from X · 12s ago');
  });

  it('renders a bare live post as what it is and no more', () => {
    view(xpost({ source: 'gmgn', text: 'gm' }));
    expect(screen.getByText('gm')).toBeInTheDocument();
    expect(document.querySelector('[data-metrics]')).toBeNull();
    expect(document.querySelector('[data-fetched]')).toBeNull();
    expect(document.querySelector('[data-link-card]')).toBeNull();
  });
});

describe('skeleton', () => {
  it('is a status with the same frame as a card', () => {
    render(<TweetSkeleton />);
    expect(screen.getByRole('status', { name: 'Fetching the tweet' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('quoted original with rich parts', () => {
  it('shows its card, poll and real addresses inside the quote without nesting links', () => {
    const q = quotePost().quoted;
    if (!q) throw new Error('no quote');
    view(
      xpost({
        kind: 'quote',
        quoted: {
          ...q,
          media: [],
          text: 'read https://t.co/q1',
          urls: [{ url: 'https://t.co/q1', expandedUrl: 'https://example.com/a', displayUrl: 'example.com/a' }],
          card: {
            kind: 'summary',
            url: 'https://example.com/a',
            domain: 'example.com',
            title: 'Quoted card',
            description: null,
            imageUrl: null,
          },
          poll: pollPost(false).poll ?? null,
        },
      }),
    );
    const quote = screen.getByRole('link', { name: /Quoted post by/ });
    expect(quote).toHaveTextContent('read example.com/a');
    expect(within(quote).getByText('Quoted card')).toBeInTheDocument();
    expect(within(quote).getByText('Solana')).toBeInTheDocument();
    expect(within(quote).queryAllByRole('link')).toHaveLength(0);
  });
});

describe('extras only', () => {
  it('leaves out the repost line, the header, "Replying to" and the text, and keeps the rest', () => {
    const post = { ...richPost(), inReplyTo: { id: null, handle: 'someone' } };
    render(<TweetView post={post} extrasOnly />);
    expect(document.querySelector('header')).toBeNull();
    expect(document.querySelector('[data-tweet-text]')).toBeNull();
    expect(document.querySelector('[data-reply]')).toBeNull();
    expect(screen.queryByRole('img', { name: /Verified/ })).toBeNull();
    expect(document.querySelector('[data-metrics]')).not.toBeNull();
    expect(screen.getByRole('link', { name: /View on X/ })).toBeInTheDocument();
  });

  it('holds room for the counts while the full post is on its way', () => {
    render(<TweetView post={xpost()} pending />);
    expect(document.querySelector('[data-metrics-placeholder]')).not.toBeNull();
    cleanup();
    render(<TweetView post={richPost()} pending />);
    expect(document.querySelector('[data-metrics-placeholder]')).toBeNull();
    expect(document.querySelector('[data-metrics]')).not.toBeNull();
  });
});
