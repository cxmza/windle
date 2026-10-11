import { queryOptions } from '@tanstack/react-query';
import { type Api, api } from '@/lib/api';

export const sessionQuery = (client: Api = api) =>
  queryOptions({
    queryKey: ['session'],
    queryFn: ({ signal }) => client.getSession(signal),
    // The gate shows the error with a manual retry instead of silently re-trying behind a spinner.
    retry: false,
    staleTime: 60_000,
    // Coming back to the tab re-checks, so an expired session sends the person to sign in rather than to errors.
    refetchOnWindowFocus: true,
  });

export const meQuery = (client: Api = api) =>
  queryOptions({
    queryKey: ['me'],
    queryFn: ({ signal }) => client.getMe(signal),
    retry: false,
  });
