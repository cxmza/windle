import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixtureMarkets } from '../markets/fixtures';
import { type MarketsSource, marketsQuery } from '../markets/source';
import { createFixtureProjects } from '../projects/fixtures';
import type { ProjectsSource } from '../projects/source';
import { createLiveFeed } from './feed';
import { useLiveDriver } from './use-live';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function setup(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  const universe = createFixtureMarkets(NOW);
  const feed = createLiveFeed({ seed: 11, universe });
  const markets: MarketsSource = { sample: true, live: () => feed, list: async () => universe };
  const projects: ProjectsSource = { sample: true, live: () => feed, list: async () => createFixtureProjects(NOW) };
  const client = new QueryClient();
  client.setQueryData(marketsQuery(markets).queryKey, universe);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useLiveDriver(markets, projects), { wrapper });
  return { feed, client, markets, universe, hook };
}

describe('useLiveDriver', () => {
  const original = window.matchMedia;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = original;
  });

  it('runs the feed and writes odds into the query cache', () => {
    const { feed, client, markets, universe, hook } = setup(false);
    vi.advanceTimersByTime(30_000);
    const events = feed.snapshot().events;
    expect(events.length).toBeGreaterThan(0);
    const cached = client.getQueryData(marketsQuery(markets).queryKey);
    const trade = events.find((e) => e.kind === 'trade');
    if (trade?.kind === 'trade') {
      expect(cached?.find((m) => m.id === trade.marketId)?.shipProbability).toBe(feed.odds(trade.marketId));
    }
    expect(cached).not.toBe(universe);
    hook.unmount();
    const after = feed.snapshot().events.length;
    vi.advanceTimersByTime(60_000);
    expect(feed.snapshot().events.length).toBe(after);
  });

  it('stays off under prefers-reduced-motion', () => {
    const { feed, client, markets, universe, hook } = setup(true);
    vi.advanceTimersByTime(60_000);
    expect(feed.snapshot().events).toHaveLength(0);
    expect(client.getQueryData(marketsQuery(markets).queryKey)).toBe(universe);
    hook.unmount();
  });
});
