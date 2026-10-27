import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFeedRegistry } from '../feed/registry';
import { resetSimulatedFeed } from '../feed/simulated-source';
import { FEED_OPEN_KEY } from '../feed/use-feed-open';
import { FakeApi, makeMarket } from '../predict/test-support';
import { PREFS_KEY, reloadPrefs } from '../settings/prefs';
import { MarketsHome } from './MarketsHome';

function stubViewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query);
    const matches = min ? width >= Number(min[1]) * 16 : false;
    return {
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MarketsHome />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const findTable = () => screen.findByRole('table', { name: 'Market list' });
const feedRegion = () => screen.queryByRole('region', { name: 'X feed' });
const table = () => screen.queryByRole('table', { name: 'Market list' });

beforeEach(() => {
  window.localStorage.clear();
  resetSimulatedFeed();
  clearFeedRegistry();
  reloadPrefs();
  new FakeApi({ markets: [makeMarket(), makeMarket()] }).install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('markets home: three zones', () => {
  it('shows the feed column beside the markets table from lg up, without tabs or a drawer toggle in play', async () => {
    stubViewport(1280);
    renderHome();
    expect(feedRegion()).toHaveAttribute('data-mode', 'column');
    expect(await findTable()).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Home sections' })).toBeNull();
    expect(within(screen.getByRole('feed')).getAllByRole('article').length).toBeGreaterThanOrEqual(10);
  });

  it('keeps the live feed running on screen: it says Live and counts its posts', () => {
    stubViewport(1280);
    renderHome();
    expect(within(feedRegion() as HTMLElement).getByText('Live')).toBeInTheDocument();
    expect(screen.getByText(/^1\d posts$/)).toBeInTheDocument();
  });

  it('shows Paused and a disabled button while the Live feed setting is off', () => {
    stubViewport(1280);
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ live: 'off' }));
    reloadPrefs();
    renderHome();
    expect(within(feedRegion() as HTMLElement).getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume the feed' })).toBeDisabled();
  });

  it('pauses and resumes from the header button', () => {
    stubViewport(1280);
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Pause the feed' }));
    expect(within(feedRegion() as HTMLElement).getByText('Paused')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume the feed' }));
    expect(within(feedRegion() as HTMLElement).getByText('Live')).toBeInTheDocument();
  });
});

describe('markets home: md to lg drawer', () => {
  it('starts collapsed, opens from the header toggle and remembers it', async () => {
    stubViewport(900);
    const first = renderHome();
    const toggle = screen.getByRole('button', { name: 'X feed' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(feedRegion()).toBeNull();
    expect(await findTable()).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(feedRegion()).toHaveAttribute('data-mode', 'overlay');
    expect(window.localStorage.getItem(FEED_OPEN_KEY)).toBe('1');

    first.unmount();
    renderHome();
    expect(feedRegion()).toHaveAttribute('data-mode', 'overlay');
  });

  it('closes from the drawer button and from Escape', () => {
    stubViewport(900);
    window.localStorage.setItem(FEED_OPEN_KEY, '1');
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the feed' }));
    expect(feedRegion()).toBeNull();
    expect(window.localStorage.getItem(FEED_OPEN_KEY)).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'X feed' }));
    fireEvent.keyDown(feedRegion() as HTMLElement, { key: 'Escape' });
    expect(feedRegion()).toBeNull();
  });

  it('works when storage is blocked', () => {
    stubViewport(900);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'X feed' }));
    expect(feedRegion()).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('markets home: small screens', () => {
  it('shows tabs, the markets pane first, and swaps panes on the Feed tab', async () => {
    stubViewport(375);
    renderHome();
    const tabs = screen.getByRole('tablist', { name: 'Home sections' });
    const markets = within(tabs).getByRole('tab', { name: 'Markets' });
    const feedTab = within(tabs).getByRole('tab', { name: 'Feed' });
    expect(markets).toHaveAttribute('aria-selected', 'true');
    expect(await findTable()).toBeInTheDocument();
    expect(feedRegion()).toBeNull();

    fireEvent.click(feedTab);
    expect(feedTab).toHaveAttribute('aria-selected', 'true');
    expect(feedRegion()).toHaveAttribute('data-mode', 'page');
    expect(table()).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'Feed' })).toContainElement(feedRegion());

    fireEvent.click(markets);
    expect(await findTable()).toBeInTheDocument();
    expect(feedRegion()).toBeNull();
  });

  it('moves between tabs with the arrow keys', () => {
    stubViewport(375);
    renderHome();
    const markets = screen.getByRole('tab', { name: 'Markets' });
    markets.focus();
    fireEvent.keyDown(markets, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Feed' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Markets' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the feed state while the Markets tab is shown', () => {
    stubViewport(375);
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: 'Feed' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Promises' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Markets' }));
    act(() => {});
    fireEvent.click(screen.getByRole('tab', { name: 'Feed' }));
    expect(screen.getByRole('radio', { name: 'Promises' })).toBeChecked();
  });
});

describe('markets home: no markets yet', () => {
  beforeEach(() => {
    new FakeApi().install();
  });

  it('beside the feed column the empty state points at the create wizard and does not repeat the feed', async () => {
    stubViewport(1280);
    renderHome();
    expect(await screen.findByRole('heading', { level: 2, name: 'No open markets yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a market from a live post' })).toHaveAttribute('href', '/create');
    expect(screen.queryByRole('button', { name: 'Open the live feed' })).toBeNull();
  });

  it('on a phone its second button brings up the Feed tab', async () => {
    stubViewport(375);
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Open the live feed' }));
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(feedRegion()).toHaveAttribute('data-mode', 'page');
  });

  it('between md and lg it opens the feed drawer', async () => {
    stubViewport(900);
    renderHome();
    expect(feedRegion()).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Open the live feed' }));
    expect(feedRegion()).toHaveAttribute('data-mode', 'overlay');
  });
});
