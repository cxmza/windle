import { queryOptions } from '@tanstack/react-query';
import { createFixtureMarkets } from './fixtures';
import type { Market } from './types';

export interface MarketsSource {
  readonly sample: boolean;
  list(signal?: AbortSignal): Promise<readonly Market[]>;
}

export const fixtureSource: MarketsSource = {
  sample: true,
  list: async () => createFixtureMarkets(Date.now()),
};

export const marketsQuery = (source: MarketsSource = fixtureSource) =>
  queryOptions({
    queryKey: ['markets', source.sample ? 'sample' : 'live'],
    queryFn: ({ signal }) => source.list(signal),
    staleTime: source.sample ? Number.POSITIVE_INFINITY : 30_000,
  });
