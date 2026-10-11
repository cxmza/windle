import { type RefObject, useEffect, useState } from 'react';

export type ApiHealth = { status: 'checking' } | { status: 'ok'; latencyMs: number } | { status: 'down' };

export const HEALTH_INTERVAL_MS = 60_000;
export const HEALTH_TIMEOUT_MS = 4_000;

/** One probe: resolves to ok + round-trip latency, or down (non-2xx, network error, CORS, timeout). Never throws. */
export async function probeHealth(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<ApiHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetchFn(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return { status: 'down' };
    return { status: 'ok', latencyMs: Math.max(1, Math.round(performance.now() - started)) };
  } catch {
    return { status: 'down' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live API status for `target`: probes once when it scrolls into view and then every 60 s while it stays visible
 * (a hidden tab or an offscreen footer costs nothing). Without IntersectionObserver (jsdom, ancient engines) nothing
 * is fetched and the status stays `checking`.
 */
export function useApiHealth(target: RefObject<Element | null>, url: string, fetchFn?: typeof fetch): ApiHealth {
  const [health, setHealth] = useState<ApiHealth>({ status: 'checking' });
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let interval = 0;
    let alive = true;
    const run = () => {
      if (document.visibilityState === 'hidden') return;
      void probeHealth(url, fetchFn ?? fetch).then((next) => {
        if (alive) setHealth(next);
      });
    };
    const stop = () => {
      window.clearInterval(interval);
      interval = 0;
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        if (interval) return;
        run();
        interval = window.setInterval(run, HEALTH_INTERVAL_MS);
      } else {
        stop();
      }
    });
    observer.observe(el);
    return () => {
      alive = false;
      stop();
      observer.disconnect();
    };
  }, [target, url, fetchFn]);
  return health;
}
