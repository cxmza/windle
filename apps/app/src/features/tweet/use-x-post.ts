import { useQuery } from '@tanstack/react-query';
import { loadXPost, type XPostResult } from './x-post-api';

const FRESH_MS = 30_000;

/** A post by id, cached by react-query. Not-found and rate-limit answers are data here, not thrown errors. */
export function useXPost(id: string | null, options: { enrich: boolean; enabled?: boolean }) {
  return useQuery<XPostResult>({
    queryKey: ['x-post', id, options.enrich],
    queryFn: () => loadXPost(id ?? '', options.enrich),
    enabled: id !== null && (options.enabled ?? true),
    staleTime: FRESH_MS,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
