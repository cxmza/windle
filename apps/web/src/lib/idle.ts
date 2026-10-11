/**
 * A FIFO of small main-thread jobs, one per idle period (requestIdleCallback; setTimeout where it is missing).
 * For work that must be done before the reader gets somewhere but not before first paint — e.g. splitting the
 * below-the-fold titles into chars (measured: ~1 s of the mobile-4x boot when all of them split in the first commit).
 * `timeout` bounds the wait on a busy main thread, so every job still runs within a few seconds.
 */
type Job = { run: () => void; cancelled: boolean };

const queue: Job[] = [];
let scheduled = false;
const TIMEOUT_MS = 1000;

function schedule() {
  if (scheduled || queue.length === 0) return;
  scheduled = true;
  const tick = () => {
    scheduled = false;
    let job = queue.shift();
    while (job?.cancelled) job = queue.shift();
    job?.run();
    schedule();
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(tick, { timeout: TIMEOUT_MS });
  else window.setTimeout(tick, 16);
}

/** Queue `run` for an idle period. Returns a cancel function (safe to call after it ran). */
export function whenIdle(run: () => void): () => void {
  const job: Job = { run, cancelled: false };
  queue.push(job);
  schedule();
  return () => {
    job.cancelled = true;
  };
}
