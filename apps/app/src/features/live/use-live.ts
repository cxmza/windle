import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { useReducedMotion } from '@/lib/media';
import { fixtureSource, type MarketsSource, marketsQuery } from '../markets/source';
import { fixtureProjectsSource, type ProjectsSource, projectsQuery } from '../projects/source';
import { browserEnv, type LiveFeed, type LiveSnapshot, startDriver } from './feed';

/**
 * Runs the sample live feed while the calling page is mounted and folds every event into the query cache, so all
 * views (list, detail, scene, menu) update from one place. Off under reduced motion: values stay correct, static.
 */
export function useLiveDriver(
  markets: MarketsSource = fixtureSource,
  projects: ProjectsSource = fixtureProjectsSource,
): void {
  const client = useQueryClient();
  const reduced = useReducedMotion();
  useEffect(() => {
    const feed = markets.live?.();
    if (!feed || reduced) return;
    const marketsKey = marketsQuery(markets).queryKey;
    const projectsKey = projectsQuery(projects).queryKey;
    const unsubscribe = feed.subscribe(() => {
      client.setQueryData(marketsKey, (old) => (old ? feed.applyMarkets(old) : old));
      client.setQueryData(projectsKey, (old) => (old ? feed.applyProjects(old) : old));
    });
    const stop = startDriver(feed, browserEnv());
    return () => {
      stop();
      unsubscribe();
    };
  }, [client, markets, projects, reduced]);
}

const EMPTY: LiveSnapshot = { version: 0, events: [], paused: false };
const noop = () => () => {};

export function useLiveSnapshot(feed: LiveFeed | undefined): LiveSnapshot {
  return useSyncExternalStore(feed ? feed.subscribe : noop, feed ? feed.snapshot : () => EMPTY, () => EMPTY);
}
