import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { CandleTimeframe, MarketListQuery, MarketSide } from '@windle/shared';
import { marketsApi } from './api';
import { isNotFound } from './errors';

/** Detail pages and lists re-ask the api this often while the tab is visible; the browser pauses hidden tabs. */
export const POLL_MS = 8_000;

/** The chart re-asks for candles this often while its market is open and the tab is visible. */
export const CANDLES_POLL_MS = 5_000;

export const PAGE_SIZE = 100;

export type MarketsQuery = Omit<MarketListQuery, 'limit' | 'offset'>;

export const predictKeys = {
  all: ['predict'] as const,
  markets: (query: MarketsQuery) => ['predict', 'markets', query] as const,
  market: (slug: string) => ['predict', 'market', slug] as const,
  candles: (slug: string, tf: CandleTimeframe, side: MarketSide) => ['predict', 'candles', slug, tf, side] as const,
  portfolio: ['predict', 'portfolio'] as const,
  leaderboard: ['predict', 'leaderboard'] as const,
};

export const marketsQuery = (query: MarketsQuery, poll: boolean) =>
  infiniteQueryOptions({
    queryKey: predictKeys.markets(query),
    queryFn: ({ pageParam, signal }) => marketsApi.list({ ...query, limit: PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 5_000,
    refetchInterval: poll ? POLL_MS : false,
  });

export const marketQuery = (slug: string) =>
  queryOptions({
    queryKey: predictKeys.market(slug),
    queryFn: ({ signal }) => marketsApi.detail(slug, signal),
    staleTime: 3_000,
    refetchInterval: (query) => {
      const status = query.state.data?.market.status;
      return status === 'resolved' || status === 'voided' ? false : POLL_MS;
    },
    retry: (count, error) => count < 1 && !isNotFound(error),
  });

export const candlesQuery = (slug: string, tf: CandleTimeframe, side: MarketSide, live: boolean) =>
  queryOptions({
    queryKey: predictKeys.candles(slug, tf, side),
    queryFn: ({ signal }) => marketsApi.candles(slug, tf, side, signal),
    staleTime: 2_000,
    refetchInterval: live ? CANDLES_POLL_MS : false,
    placeholderData: keepPreviousData,
  });

export const portfolioQuery = (poll = false) =>
  queryOptions({
    queryKey: predictKeys.portfolio,
    queryFn: ({ signal }) => marketsApi.portfolio(signal),
    staleTime: 5_000,
    refetchInterval: poll ? POLL_MS : false,
  });

export const leaderboardQuery = () =>
  queryOptions({
    queryKey: predictKeys.leaderboard,
    queryFn: ({ signal }) => marketsApi.leaderboard(signal),
    staleTime: 5_000,
    refetchInterval: POLL_MS,
  });
