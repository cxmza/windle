/** Reads a duration token (e.g. `--dur-slower`) in ms, so JS-driven motion follows the same scale as CSS. */
export function cssDuration(name: string, fallback: number): number {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n;
}

/** Close to --ease-decelerate for a rAF tween: fast start, long soft landing. */
export const decelerate = (t: number): number => 1 - (1 - t) ** 4;

/** Motion's full feature set (drag, layout), fetched on demand so it never lands in the main chunk. */
export const loadMaxFeatures = () => import('./motion-features-max').then((mod) => mod.default);

/** A Motion spring that settles in a duration token, with no overshoot. */
export const calmSpring = (name: string, fallback: number) =>
  ({ type: 'spring', visualDuration: cssDuration(name, fallback) / 1000, bounce: 0 }) as const;

/** Reads an easing token (e.g. `--ease-decelerate`) as a CSS timing function string for WAAPI. */
export function cssEasing(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
