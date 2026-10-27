import { thumbHashToDataURL } from 'thumbhash';

const MAX_ENTRIES = 400;
const cache = new Map<string, string | null>();

/** The blurred stand-in for an image as a tiny data URL. Decoded once per id; null when the hash is unusable. */
export function placeholderUrl(id: string, thumbhash: string): string | null {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  let url: string | null = null;
  try {
    const raw = atob(thumbhash);
    url = thumbHashToDataURL(Uint8Array.from(raw, (ch) => ch.charCodeAt(0)));
  } catch {
    url = null;
  }
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(id, url);
  return url;
}

const warmed = new Set<string>();

/** Starts fetching an image so it is in the HTTP cache by the time a screen needs it. */
export function prefetchImage(url: string): void {
  if (warmed.has(url) || typeof Image === 'undefined') return;
  warmed.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}
