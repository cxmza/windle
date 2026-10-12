import { createFixtureMarkets } from '../markets/fixtures';
import { createLiveFeed, type LiveFeed } from './feed';

let epoch: number | undefined;
let feed: LiveFeed | undefined;

/** One clock for every sample fixture, so the list, the detail page and the scene count down to the same instant. */
export const sampleEpoch = (): number => {
  epoch ??= Date.now();
  return epoch;
};

export function sampleFeed(): LiveFeed {
  feed ??= createLiveFeed({
    seed: Math.floor(Math.random() * 2 ** 32),
    universe: createFixtureMarkets(sampleEpoch()),
  });
  return feed;
}
