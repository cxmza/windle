/**
 * A FIFO of small main-thread jobs, one per idle period (requestIdleCallback; setTimeout where it is missing).
 * For work that must be done before the reader gets somewhere but not before first paint — e.g. splitting the
 * below-the-fold titles into chars (measured: ~1 s of the mobile-4x boot when all of them split in the first commit).
 * `timeout` bounds the wait on a busy main thread, so every job still runs within a few seconds.
 *
 * Scroll-aware: while the reader is scrolling (a scroll/wheel/touchmove within the last CALM_MS) a job waits for the
 * scroll to settle, because an idle period between two scroll frames is still mid-gesture — measured (mobile-4x): a
 * chapter mount there forced a 100-200 ms style + layout and dropped frames of the first scroll. A job runs anyway
 * when its `urgent()` says so (the chapter is about to be reached) or after MAX_DEFER_MS of continuous scrolling.
 */
type Job = { run: () => void; cancelled: boolean; urgent?: () => boolean; queuedAt: number };

const queue: Job[] = [];
let scheduled = false;
const TIMEOUT_MS = 1000;
const CALM_MS = 200;
const MAX_DEFER_MS = 3000;

let lastScrollAt = Number.NEGATIVE_INFINITY;
let listening = false;

function listenForScroll() {
  if (listening || typeof window.addEventListener !== 'function') return;
  listening = true;
  const mark = () => {
    lastScrollAt = performance.now();
  };
  // capture: scrolls of inner scrollers count too; passive: never delays the scroll itself
  for (const type of ['scroll', 'wheel', 'touchmove'] as const) {
    window.addEventListener(type, mark, { passive: true, capture: true });
  }
}

function requestIdle(cb: () => void) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(cb, { timeout: TIMEOUT_MS });
  else window.setTimeout(cb, 16);
}

function schedule(delayMs = 0) {
  if (scheduled || queue.length === 0) return;
  scheduled = true;
  const tick = () => {
    scheduled = false;
    let job = queue.shift();
    while (job?.cancelled) job = queue.shift();
    if (!job) return;
    const now = performance.now();
    const sinceScroll = now - lastScrollAt;
    if (sinceScroll < CALM_MS && now - job.queuedAt < MAX_DEFER_MS && !job.urgent?.()) {
      queue.unshift(job);
      schedule(CALM_MS - sinceScroll);
      return;
    }
    job.run();
    schedule();
  };
  if (delayMs > 0) window.setTimeout(() => requestIdle(tick), delayMs);
  else requestIdle(tick);
}

export interface IdleOptions {
  /** Checked when the job is due during a scroll: true runs it right away instead of waiting for the scroll to settle. */
  urgent?: () => boolean;
}

/** Queue `run` for an idle period. Returns a cancel function (safe to call after it ran). */
export function whenIdle(run: () => void, options: IdleOptions = {}): () => void {
  listenForScroll();
  const job: Job = { run, cancelled: false, urgent: options.urgent, queuedAt: performance.now() };
  queue.push(job);
  schedule();
  return () => {
    job.cancelled = true;
  };
}
