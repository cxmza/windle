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
