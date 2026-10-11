/** True where paint timing and idle callbacks exist (Chromium, Firefox, Safari 18.2+; not jsdom). */
export function canWaitForFirstPaint(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof PerformanceObserver !== 'undefined' &&
    (PerformanceObserver.supportedEntryTypes ?? []).includes('paint') &&
    typeof window.requestIdleCallback === 'function'
  );
}

/**
 * Runs `cb` once the first contentful paint has happened (or after `fallbackMs`). Returns a cancel function.
 * For work that must not compete with first paint: the WebGL layer, below-the-fold chapters.
 */
export function afterFirstPaint(cb: () => void, fallbackMs = 3000): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => {
      if (list.getEntriesByName('first-contentful-paint').length > 0) run();
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    run();
  }
  const timer = window.setTimeout(run, fallbackMs);
  return () => {
    done = true;
    observer?.disconnect();
    window.clearTimeout(timer);
  };
}
