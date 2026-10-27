import { useSyncExternalStore } from 'react';

const KEY = 'windle.reported-media.v1';
const MAX = 200;

const listeners = new Set<() => void>();
let ids: ReadonlySet<string> | null = null;

function load(): ReadonlySet<string> {
  if (ids) return ids;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    ids = new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    ids = new Set();
  }
  return ids;
}

/** Remember, in this browser only, that an image was reported, so its menu shows "Reported" after a reload. */
export function markReported(id: string): void {
  const next = new Set(load());
  next.add(id);
  ids = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...next].slice(-MAX)));
  } catch {
    // storage can be blocked; the state still holds for this page view
  }
  for (const l of listeners) l();
}

export function resetReported(): void {
  ids = null;
  for (const l of listeners) l();
}

export function useIsReported(id: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => load().has(id),
    () => false,
  );
}
