import { useSyncExternalStore } from 'react';
import { applyAppearance, watchSystemAppearance } from './appearance';

export const PREFS_KEY = 'windle.prefs.v1';

export const PREF_OPTIONS = {
  motion: ['system', 'reduced'],
  live: ['on', 'off'],
  feedMotion: ['smooth', 'calm'],
  density: ['comfortable', 'compact'],
  odds: ['percent', 'decimal'],
  deadlines: ['countdown', 'date'],
  clock: ['24h', '12h'],
  theme: ['system', 'light', 'dark'],
  font: ['inter', 'system', 'atkinson', 'mono'],
  textSize: ['small', 'medium', 'large'],
  contrast: ['off', 'on'],
} as const;

export type PrefKey = keyof typeof PREF_OPTIONS;
export type Prefs = { [K in PrefKey]: (typeof PREF_OPTIONS)[K][number] };

export type OddsFormat = Prefs['odds'];
export type DeadlineMode = Prefs['deadlines'];
export type ClockFormat = Prefs['clock'];

export const DEFAULT_PREFS: Prefs = {
  motion: 'system',
  live: 'on',
  feedMotion: 'calm',
  density: 'compact',
  odds: 'percent',
  deadlines: 'countdown',
  clock: '24h',
  theme: 'system',
  font: 'inter',
  textSize: 'medium',
  contrast: 'off',
};

function pick<K extends PrefKey>(key: K, raw: Record<string, unknown>): Prefs[K] {
  const value = raw[key];
  const allowed: readonly unknown[] = PREF_OPTIONS[key];
  // narrowed by the allow-list on the line above
  return allowed.includes(value) ? (value as Prefs[K]) : DEFAULT_PREFS[key];
}

/** Anything goes in, a complete valid Prefs comes out: unknown keys are dropped, bad values fall back per field. */
export function parsePrefs(raw: unknown): Prefs {
  const obj: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  return {
    motion: pick('motion', obj),
    live: pick('live', obj),
    feedMotion: pick('feedMotion', obj),
    density: pick('density', obj),
    odds: pick('odds', obj),
    deadlines: pick('deadlines', obj),
    clock: pick('clock', obj),
    theme: pick('theme', obj),
    font: pick('font', obj),
    textSize: pick('textSize', obj),
    contrast: pick('contrast', obj),
  };
}

function load(): Prefs {
  try {
    const text = window.localStorage.getItem(PREFS_KEY);
    return text === null ? DEFAULT_PREFS : parsePrefs(JSON.parse(text));
  } catch {
    return DEFAULT_PREFS;
  }
}

function sameAs(a: Prefs, b: Prefs): boolean {
  return (Object.keys(PREF_OPTIONS) as PrefKey[]).every((k) => a[k] === b[k]);
}

/** Motion, density and the appearance prefs are consumed by CSS, so they live on <html>; everything else is read through hooks. */
export function applyPrefsToDocument(prefs: Prefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (prefs.motion === 'reduced') root.setAttribute('data-motion', 'reduced');
  else root.removeAttribute('data-motion');
  if (prefs.density === 'compact') root.setAttribute('data-density', 'compact');
  else root.removeAttribute('data-density');
  applyAppearance(prefs);
}

let current: Prefs = typeof window === 'undefined' ? DEFAULT_PREFS : load();
const listeners = new Set<() => void>();
applyPrefsToDocument(current);
if (typeof window !== 'undefined') watchSystemAppearance(() => applyAppearance(current));

function commit(next: Prefs): void {
  if (sameAs(current, next)) return;
  current = next;
  applyPrefsToDocument(current);
  for (const l of listeners) l();
}

/** Re-reads storage (another tab wrote, or a test cleared it). */
export function reloadPrefs(): void {
  commit(load());
}

function onStorage(e: StorageEvent): void {
  if (e.key === null || e.key === PREFS_KEY) reloadPrefs();
}

export const getPrefs = (): Prefs => current;

export function setPref<K extends PrefKey>(key: K, value: Prefs[K]): void {
  const next: Prefs = { ...current, [key]: value };
  commit(next);
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // storage blocked or full: the choice still applies for this tab
  }
}

export function resetPrefs(): void {
  commit(DEFAULT_PREFS);
  try {
    window.localStorage.removeItem(PREFS_KEY);
  } catch {
    // see setPref
  }
}

export function subscribePrefs(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
}

export function usePref<K extends PrefKey>(key: K): Prefs[K] {
  return useSyncExternalStore(
    subscribePrefs,
    () => current[key],
    () => DEFAULT_PREFS[key],
  );
}
