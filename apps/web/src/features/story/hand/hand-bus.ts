/**
 * Hand bus: the contract between whoever is drawing a stroke (DOM motion) and the DrawingHand overlay.
 *
 *   const token = startStroke(centerPath);   // pen goes down: the hand appears and follows the stroke tip
 *   ...animate centerPath stroke-dashoffset 1 -> 0 (draw-on.ts does this)...
 *   endStroke(token);                         // pen lifts: the hand lets go
 *
 * `el` is the stroke centerline, `[data-stroke-center]` (HandStroke.tsx); it is authored with pathLength=1, so the
 * progress of the tip along it is `1 - stroke-dashoffset`. DrawingHand reads that every frame, nothing else has to be
 * reported. For anything that is not driven by dashoffset, pass `{ progress }` (0..1) in the options.
 *
 * The store is module-level on purpose (one hand per page). Only one stroke is active at a time: a new `startStroke`
 * takes the hand over, and a stale `endStroke(token)` from the stroke that was taken over is ignored.
 */

export type StrokeOptions = {
  /** Overrides the dashoffset-derived progress (0 = pen at the start of the stroke, 1 = at its end). */
  progress?: () => number;
};

export type HandState =
  | { status: 'idle' }
  | { status: 'drawing'; el: Element; token: number; progress: (() => number) | null };

const IDLE: HandState = { status: 'idle' };
let state: HandState = IDLE;
let nextToken = 0;
const listeners = new Set<() => void>();

function set(next: HandState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

/** Pen down on `el`. Returns a token for the matching `endStroke`. */
export function startStroke(el: Element, options: StrokeOptions = {}): number {
  nextToken += 1;
  set({ status: 'drawing', el, token: nextToken, progress: options.progress ?? null });
  return nextToken;
}

/**
 * Pen up. With a token, only ends that stroke (ignored when another stroke has taken over); without one, always ends.
 */
export function endStroke(token?: number): void {
  if (state.status === 'idle') return;
  if (token !== undefined && token !== state.token) return;
  set(IDLE);
}

export function getHandState(): HandState {
  return state;
}

/** Subscribe to state changes (compatible with `useSyncExternalStore`). Returns the unsubscribe function. */
export function subscribeHand(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
