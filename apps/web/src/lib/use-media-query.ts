import { useSyncExternalStore } from 'react';

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  };
}

/** Live media-query match; false on the server and when matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const NO_MOTION_PREF_QUERY = '(prefers-reduced-motion: no-preference)';
