import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type TweetSnapshot, tweetUrl } from '@windle/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newClient, Providers } from '@/features/predict/test-render';
import { FakeApi, makeMarket } from '@/features/predict/test-support';
import { PREFS_KEY, reloadPrefs } from '@/features/settings/prefs';
import { tweetId } from './build';
import { FeedColumn } from './FeedColumn';
import { mapPost } from './live-map';
import { post } from './live-test-support';
import type { TweetFeed } from './use-tweet-feed';

const tweet = (n: number, text = `post number ${n}`): TweetSnapshot => ({
  id: String(20_000 + n),
  url: tweetUrl('someteam', String(20_000 + n)),
  author: { handle: 'someteam', name: 'Some Team' },
  text,
  createdAt: new Date(Date.now() - (100 - n) * 1000).toISOString(),
  capturedAt: new Date().toISOString(),
});

const feedOf = (tweets: readonly TweetSnapshot[], over: Partial<TweetFeed> = {}): TweetFeed => ({
  kind: 'sample',
  tweets,
  paused: false,
  liveOff: false,
  toggle: vi.fn(),
  ...over,
});

const newestFirst = (...ns: number[]) => ns.map((n) => tweet(n));

let fake: FakeApi;

function setup(initial: readonly TweetSnapshot[], over: Partial<TweetFeed> = {}) {
  const client = newClient();
  const tree = (tweets: readonly TweetSnapshot[]) => (
    <Providers client={client}>
      <FeedColumn feed={feedOf(tweets, over)} mode="column" id="feed-panel" />
    </Providers>
  );
  const view = render(tree(initial));
  return {
    client,
    push: (next: readonly TweetSnapshot[]) => view.rerender(tree(next)),
  };
}

const feed = () => screen.getByRole('feed');
const pill = () => screen.queryByRole('button', { name: /new posts?/ });

function mockLayout(el: HTMLElement, rowHeight = 100) {
  let top = 0;
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => (top = v) });
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => el.querySelectorAll('[data-feed-row]').length * rowHeight,
  });
  return {
    scrollTo: (to: number) => {
      top = to;
      fireEvent.scroll(el);
    },
    top: () => top,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  fake = new FakeApi().install();
  reloadPrefs();
});

afterEach(() => vi.restoreAllMocks());

describe('feed structure', () => {
  it('is a labelled feed of articles, each named by its author and text', () => {
    setup(newestFirst(2, 1));
    expect(feed()).toHaveAttribute('aria-busy', 'false');
    const articles = within(feed()).getAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveAccessibleName(/Some Team.*post number 2/);
  });

  it('shows the live status, the count and the pause control', () => {
    setup(newestFirst(3, 2, 1));
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('3 posts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause the feed' })).toBeEnabled();
  });

  const status = () => document.querySelector('[data-feed-status] > [data-label]:not([aria-hidden])');
  const dot = () => document.querySelector('[data-live-dot]');
  const live = { status: 'live', failures: 0, everLive: true } as const;

  it('reads Sample with an accent dot for simulated posts, never Live', () => {
    setup(newestFirst(1));
    expect(status()).toHaveTextContent('Sample');
    expect(dot()).toHaveAttribute('data-tone', 'sample');
    expect(dot()).toHaveAttribute('data-paused');
  });

  it('reads Live with the live dot for a connected source', () => {
    setup(newestFirst(1), { kind: 'live', connection: live });
    expect(status()).toHaveTextContent('Live');
    expect(dot()).not.toHaveAttribute('data-paused');
    expect(dot()).not.toHaveAttribute('data-tone');
  });

  it('shows skeleton rows and the outage text when the stream never came up', () => {
    setup([], { kind: 'live', connection: { status: 'connecting', failures: 2, everLive: false } });
    expect(status()).toHaveTextContent('Offline');
    expect(screen.getByText('X feed unavailable · retrying')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-feed-skeleton] [aria-hidden] > div')).toHaveLength(5);
    expect(screen.queryByText('No posts yet.')).toBeNull();
  });

  it('keeps skeleton rows instead of "No posts yet." when a feed that was live is empty again', () => {
    setup([], { kind: 'live', connection: { status: 'reconnecting', failures: 1, everLive: true } });
    expect(status()).toHaveTextContent('Syncing');
    expect(screen.getByText('Reconnecting to the X stream…')).toBeInTheDocument();
    setup([], { kind: 'live', connection: live });
    expect(screen.getByText('Waiting for posts…')).toBeInTheDocument();
    expect(screen.queryByText('No posts yet.')).toBeNull();
  });

  it('starts with a skip link that moves focus to the first market row', () => {
    render(
      <Providers client={newClient()}>
        <div data-market-row>
          <a data-row-link href="/m/x">
            Market
          </a>
        </div>
        <FeedColumn feed={feedOf(newestFirst(1))} mode="column" id="feed-panel" />
      </Providers>,
    );
    const skip = screen.getByRole('button', { name: 'Skip feed' });
    expect(skip.compareDocumentPosition(screen.getByRole('button', { name: 'Pause the feed' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(skip);
    expect(screen.getByRole('link', { name: 'Market' })).toHaveFocus();
  });

  it('says Paused and offers resume when paused', () => {
    setup(newestFirst(1), { paused: true });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume the feed' })).toBeEnabled();
  });

  it('disables the button while the Live feed setting is off', () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ live: 'off' }));
    reloadPrefs();
    setup(newestFirst(1), { paused: true, liveOff: true });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume the feed' })).toBeDisabled();
  });

  it('links a row to the post on X in a new tab', () => {
    setup(newestFirst(1));
    const link = within(feed()).getByRole('link', { name: /open the post on X/ });
    expect(link).toHaveAttribute('href', tweetUrl('someteam', '20001'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('renders links in text as anchors and never as markup', () => {
    setup([tweet(1, 'ship <img src=x onerror=alert(1)> by Friday @kestrel_hq https://example.com/a')]);
    expect(feed().querySelector('img')).toBeNull();
    expect(within(feed()).getByRole('link', { name: '@kestrel_hq' })).toHaveAttribute(
      'href',
      'https://x.com/kestrel_hq',
    );
    expect(within(feed()).getByRole('link', { name: 'https://example.com/a' })).toBeInTheDocument();
  });

  it('tags promises', () => {
    setup([tweet(2, 'v2 ships Friday'), tweet(1, 'gm')]);
    const [promise, chatter] = within(feed()).getAllByRole('article');
    expect(within(promise as HTMLElement).getByText('Promise')).toBeInTheDocument();
    expect(within(chatter as HTMLElement).queryByText('Promise')).toBeNull();
  });
});

describe('new posts while the list is idle', () => {
  it('insert at the top with no pill, the first one after a quiet spell without waiting for a batch', async () => {
    const { push } = setup(newestFirst(2, 1));
    push(newestFirst(3, 2, 1));
    await waitFor(() => expect(within(feed()).getAllByRole('article')[0]).toHaveTextContent('post number 3'));
    expect(pill()).toBeNull();
  });

  it('meters a burst into batches of at most three rows every 1.5 s', () => {
    vi.useFakeTimers();
    try {
      const { push } = setup(newestFirst(2, 1));
      push(newestFirst(3, 2, 1));
      act(() => vi.advanceTimersByTime(0));
      expect(within(feed()).getAllByRole('article')).toHaveLength(3);
      push(newestFirst(8, 7, 6, 5, 4, 3, 2, 1));
      act(() => vi.advanceTimersByTime(1499));
      expect(within(feed()).getAllByRole('article')).toHaveLength(3);
      act(() => vi.advanceTimersByTime(1));
      expect(within(feed()).getAllByRole('article')).toHaveLength(6);
      act(() => vi.advanceTimersByTime(1500));
      expect(within(feed()).getAllByRole('article')).toHaveLength(8);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a post enriched in place', () => {
  const live = (n: number, over: Parameters<typeof post>[1] = {}) => {
    const t = mapPost(post(n, over));
    if (!t) throw new Error('post did not map');
    return t;
  };

  /** Rows are 100px, 116px once they show the reply line; the scroller is the viewport at y=0. */
  function mockRowLayout(el: HTMLElement) {
    let top = 0;
    const heightOf = (item: Element) => (item.querySelector('[data-feed-reply]') ? 116 : 100);
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => (top = v) });
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => [...el.children].reduce((sum, item) => sum + heightOf(item), 0),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === el) return new DOMRect(0, 0, 300, 400);
      if (this.parentElement !== el) return new DOMRect(0, 0, 0, 0);
      let y = -top;
      for (const item of el.children) {
        if (item === this) break;
        y += heightOf(item);
      }
      return new DOMRect(0, y, 300, heightOf(this));
    });
    return {
      scrollTo: (to: number) => {
        top = to;
        fireEvent.scroll(el);
      },
      top: () => top,
      rowTop: (id: string) => el.querySelector(`[data-tweet-id="${id}"]`)?.parentElement?.getBoundingClientRect().top,
    };
  }

  it('keeps the rows in view still when a reply line arrives in a later copy of a post above them', () => {
    const { push } = setup([live(3), live(2), live(1)], { kind: 'live' });
    const layout = mockRowLayout(feed());
    layout.scrollTo(150);
    expect(layout.rowTop(post(2).id)).toBe(-50);

    push([live(3, { kind: 'reply', inReplyTo: { id: '5', handle: 'bob' } }), live(2), live(1)]);

    const rows = within(feed()).getAllByRole('article');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector('[data-feed-reply]')).toHaveTextContent('Replying to @bob');
    expect(pill()).toBeNull();
    expect(layout.top()).toBe(166);
    expect(layout.rowTop(post(2).id)).toBe(-50);
  });
});

describe('a visible row that grows at the top', () => {
  const live = (n: number, over: Parameters<typeof post>[1] = {}) => {
    const t = mapPost(post(n, over));
    if (!t) throw new Error('post did not map');
    return t;
  };
  const reply = { kind: 'reply', inReplyTo: { id: '5', handle: 'bob' } } as const;

  function mockHeights(el: HTMLElement) {
    const heightOf = (item: Element) => (item.querySelector('[data-feed-reply]') ? 116 : 100);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === el) return new DOMRect(0, 0, 300, 400);
      if (this.parentElement !== el) return new DOMRect(0, 0, 0, 0);
      let y = 0;
      for (const item of el.children) {
        if (item === this) break;
        y += heightOf(item);
      }
      return new DOMRect(0, y, 300, heightOf(this));
    });
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 300 });
  }

  const animate = vi.fn((_frames: unknown, _timing: unknown) => ({
    finished: new Promise<void>(() => {}),
    finish: () => {},
  }));
  beforeEach(() => {
    animate.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  });

  const heightFrames = () =>
    animate.mock.calls
      .map((c) => c[0] as unknown as Record<string, string>[])
      .filter((f) => f[0]?.height !== undefined);

  it('eases the growth of the row so the rows below it do not jump', () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ feedMotion: 'smooth' }));
    reloadPrefs();
    const { push } = setup([live(2), live(1)], { kind: 'live' });
    mockHeights(feed());
    push([live(2), live(1)]);
    push([live(2, reply), live(1)]);
    expect(heightFrames()).toEqual([[{ height: '100px' }, { height: '116px' }]]);
  });

  it('does not animate size in calm mode, only fades arrivals', () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ feedMotion: 'calm' }));
    reloadPrefs();
    const { push } = setup([live(2), live(1)], { kind: 'live' });
    mockHeights(feed());
    push([live(2), live(1)]);
    push([live(2, reply), live(1)]);
    expect(heightFrames()).toEqual([]);
  });
});

describe('the crypto filter', () => {
  const live = (n: number, signals?: string[], text = `post number ${n}`) => {
    const t = mapPost(post(n, { text }));
    if (!t?.feed) throw new Error('post did not map');
    return signals ? { ...t, feed: { ...t.feed, signals } } : t;
  };

  it('is the default and hides posts the relay gave no signal, with All one click away', () => {
    setup([live(3, []), live(2, ['cashtag']), live(1, [], 'We will ship the mainnet launch by Friday')], {
      kind: 'live',
    });
    expect(screen.getByRole('radio', { name: 'Crypto' })).toBeChecked();
    expect(within(feed()).getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText('post number 3')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(within(feed()).getAllByRole('article')).toHaveLength(3);
  });

  it('tolerates a payload without signals: nothing is hidden', () => {
    setup([live(2), live(1)], { kind: 'live' });
    expect(within(feed()).getAllByRole('article')).toHaveLength(2);
  });
});

describe('buffering', () => {
  it('holds new posts back while the pointer is over the feed, then reveals them on click', () => {
    const { push } = setup(newestFirst(2, 1));
    fireEvent.pointerEnter(screen.getByRole('region', { name: 'X feed' }), { pointerType: 'mouse' });
    push(newestFirst(4, 3, 2, 1));
    expect(within(feed()).getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText('post number 4')).toBeNull();
    expect(pill()).toHaveTextContent('2 new posts');

    fireEvent.click(pill() as HTMLElement, { detail: 1 });
    expect(within(feed()).getAllByRole('article')).toHaveLength(4);
    expect(within(feed()).getAllByRole('article')[0]).toHaveTextContent('post number 4');
    expect(pill()).toBeNull();
  });

  it('resumes inserting once the pointer leaves', () => {
    const { push } = setup(newestFirst(2, 1));
    const region = screen.getByRole('region', { name: 'X feed' });
    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    push(newestFirst(3, 2, 1));
    expect(pill()).toHaveTextContent('1 new post');
    fireEvent.pointerLeave(region);
    expect(pill()).toBeNull();
    expect(within(feed()).getAllByRole('article')).toHaveLength(3);
  });

  it('ignores touch pointers, which have no hover', () => {
    const { push } = setup(newestFirst(2, 1));
    fireEvent.pointerEnter(screen.getByRole('region', { name: 'X feed' }), { pointerType: 'touch' });
    push(newestFirst(3, 2, 1));
    expect(pill()).toBeNull();
  });

  it('holds new posts while keyboard focus is inside the feed', () => {
    const { push } = setup(newestFirst(2, 1));
    const link = within(feed()).getAllByRole('link', { name: /open the post on X/ })[0] as HTMLElement;
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':focus-visible' || matches.call(this, selector);
    });
    fireEvent.focusIn(link);
    push(newestFirst(3, 2, 1));
    expect(pill()).toHaveTextContent('1 new post');
    expect(within(feed()).getAllByRole('article')).toHaveLength(2);
  });

  it('holds new posts while the list is scrolled away from the top, and reveals them on returning to it', () => {
    const { push } = setup(newestFirst(2, 1));
    const layout = mockLayout(feed());
    layout.scrollTo(300);
    push(newestFirst(3, 2, 1));
    expect(pill()).toHaveTextContent('1 new post');
    expect(within(feed()).getAllByRole('article')).toHaveLength(2);

    layout.scrollTo(0);
    expect(pill()).toBeNull();
    expect(within(feed()).getAllByRole('article')[0]).toHaveTextContent('post number 3');
  });

  it('keeps the viewport on the same rows when the pill reveals posts while scrolled, then scrolls to the top', () => {
    const { push } = setup(newestFirst(2, 1));
    const scroller = feed();
    const layout = mockLayout(scroller);
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    layout.scrollTo(300);
    push(newestFirst(4, 3, 2, 1));
    expect(layout.top()).toBe(300);

    fireEvent.click(pill() as HTMLElement, { detail: 1 });
    expect(layout.top()).toBe(500);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('does not shift a list that is a few pixels below the top when a post is inserted', async () => {
    const { push } = setup(newestFirst(2, 1));
    const layout = mockLayout(feed());
    layout.scrollTo(5);
    push(newestFirst(3, 2, 1));
    await waitFor(() => expect(layout.top()).toBe(105));
  });

  it('leaves a list at the very top where it is, so the new post lands in view', async () => {
    const { push } = setup(newestFirst(2, 1));
    const layout = mockLayout(feed());
    push(newestFirst(3, 2, 1));
    await waitFor(() => expect(within(feed()).getAllByRole('article')).toHaveLength(3));
    expect(layout.top()).toBe(0);
  });

  it('announces only the pending count, politely', async () => {
    const { push } = setup(newestFirst(2, 1));
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    fireEvent.pointerEnter(screen.getByRole('region', { name: 'X feed' }), { pointerType: 'mouse' });
    push(newestFirst(3, 2, 1));
    await waitFor(() => expect(status).toHaveTextContent('1 new post'));
    expect(status).not.toHaveTextContent('post number');
    push(newestFirst(4, 3, 2, 1));
    expect(status).toHaveTextContent('1 new post');
  });
});

describe('filters and markets', () => {
  it('filters to promises and offers a way back when none match', () => {
    setup([tweet(2, 'gm'), tweet(1, 'v2 ships Friday')]);
    fireEvent.click(screen.getByRole('radio', { name: 'Promises' }));
    expect(within(feed()).getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('1 post')).toBeInTheDocument();
  });

  it('shows an empty state for the With market filter and restores the list', () => {
    setup(newestFirst(2, 1));
    fireEvent.click(screen.getByRole('radio', { name: 'Markets' }));
    expect(screen.getByText('No posts with a market yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all posts' }));
    expect(within(feed()).getAllByRole('article')).toHaveLength(2);
  });

  it('offers Create market with the tweet url for a post without a market', () => {
    setup([tweet(1, 'v2 ships Friday')]);
    const link = within(feed()).getByRole('link', { name: 'Create market' });
    expect(link).toHaveAttribute('href', `/create?tweet=${encodeURIComponent(tweetUrl('someteam', '20001'))}`);
  });

  const linked = () => {
    const source = tweet(50, 'Some Team ships v2 by Friday.');
    const market = makeMarket({ slug: 'linked-market', source, prob: 0.62 });
    fake.add(market);
    return { market, source };
  };

  it('shows the odds pill, linked to the market, when the post is the source of a market', async () => {
    const { market, source } = linked();
    setup([source, tweet(1)]);
    const pillLink = await within(feed()).findByRole('link', { name: /open the market/ });
    expect(pillLink).toHaveAttribute('href', `/m/${market.slug}`);
    expect(pillLink).toHaveTextContent(/^YES\s*62%/);
    expect(within(feed()).getAllByRole('link', { name: 'Create market' })).toHaveLength(1);
  });

  it('follows the odds format preference', async () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ odds: 'decimal' }));
    reloadPrefs();
    const { source } = linked();
    setup([source]);
    const text = (await within(feed()).findByRole('link', { name: /open the market/ })).textContent ?? '';
    expect(text).toMatch(/YES\s*\d+\.\d{2}/);
    expect(text).not.toContain('%');
  });

  it('turns a Create market row into a market row as soon as the market exists', async () => {
    const id = tweetId(7, 0);
    const fresh = tweet(7);
    fresh.id = id;
    fresh.url = tweetUrl('someteam', id);
    const { push, client } = setup([fresh]);
    await waitFor(() => expect(fake.callsTo('GET', '/v1/markets').length).toBeGreaterThan(0));
    expect(within(feed()).getByRole('link', { name: 'Create market' })).toBeInTheDocument();

    fake.add(makeMarket({ slug: 'fresh-market', source: fresh }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['predict'] });
    });
    push([fresh]);
    expect(await within(feed()).findByRole('link', { name: /open the market/ })).toBeInTheDocument();
    expect(within(feed()).queryByRole('link', { name: 'Create market' })).toBeNull();
  });
});
