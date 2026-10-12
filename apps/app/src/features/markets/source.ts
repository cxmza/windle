import { queryOptions } from '@tanstack/react-query';
import type { LiveFeed } from '../live/feed';
import { sampleEpoch, sampleFeed } from '../live/sample';
import { createFixtureMarkets } from './fixtures';
import type { Market } from './types';

export interface MarketsSource {
  readonly sample: boolean;
  readonly live?: () => LiveFeed;
  list(signal?: AbortSignal): Promise<readonly Market[]>;
}

export const fixtureSource: MarketsSource = {
  sample: true,
  live: sampleFeed,
  list: async () => sampleFeed().applyMarkets(createFixtureMarkets(sampleEpoch())),
};

export const marketsQuery = (source: MarketsSource = fixtureSource) =>
  queryOptions({
    queryKey: ['markets', source.sample ? 'sample' : 'live'],
    queryFn: ({ signal }) => source.list(signal),
    staleTime: source.sample ? Number.POSITIVE_INFINITY : 30_000,
  });
