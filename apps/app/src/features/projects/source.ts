import { queryOptions } from '@tanstack/react-query';
import type { LiveFeed } from '../live/feed';
import { sampleEpoch, sampleFeed } from '../live/sample';
import { createFixtureProjects } from './fixtures';
import type { Project } from './types';

export interface ProjectsSource {
  readonly sample: boolean;
  readonly live?: () => LiveFeed;
  list(signal?: AbortSignal): Promise<readonly Project[]>;
}

export const fixtureProjectsSource: ProjectsSource = {
  sample: true,
  live: sampleFeed,
  list: async () => sampleFeed().applyProjects(createFixtureProjects(sampleEpoch())),
};

export const projectsQuery = (source: ProjectsSource = fixtureProjectsSource) =>
  queryOptions({
    queryKey: ['projects', source.sample ? 'sample' : 'live'],
    queryFn: ({ signal }) => source.list(signal),
    staleTime: source.sample ? Number.POSITIVE_INFINITY : 30_000,
  });
