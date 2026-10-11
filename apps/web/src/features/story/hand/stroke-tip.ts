import type { HandState } from './hand-bus';

export type Tip = { x: number; y: number; progress: number };

/** Where a pen writing a line of text sits, as a fraction of the line box height. */
const NOTE_BASELINE = 0.8;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Progress of a `[data-stroke-center]` path (pathLength=1): fully hidden is dashoffset 1, fully drawn is 0. */
export function dashProgress(el: Element): number {
  // GSAP (and addDrawOn's pin) keep the offset inline: reading it there costs nothing, while getComputedStyle every
  // frame forced a style recalc right after the frame's tween writes. Computed style stays the fallback.
  const inline = el instanceof SVGElement || el instanceof HTMLElement ? el.style.strokeDashoffset : '';
  const offset = Number.parseFloat(inline || getComputedStyle(el).strokeDashoffset);
  return Number.isFinite(offset) ? clamp01(1 - offset) : 1;
}

/**
 * Viewport position of the pen tip for the active stroke, or null when it cannot be measured (idle, not an SVG
 * geometry element, detached, jsdom). The path user space is the owning svg viewBox space, so the svg screen
 * matrix maps it to the viewport (it includes CSS transforms and scroll).
 */
export function tipOf(state: HandState): Tip | null {
  if (state.status !== 'drawing') return null;
  const el = state.el;
  if (!('getPointAtLength' in el) || !('getTotalLength' in el)) {
    // Not a path (a handwritten note revealed left to right): the pen runs along the box near its baseline.
    if (!state.progress || !(el instanceof HTMLElement)) return null;
    const box = el.getBoundingClientRect();
    if (box.width === 0) return null;
    const progress = clamp01(state.progress());
    return { x: box.left + progress * box.width, y: box.top + box.height * NOTE_BASELINE, progress };
  }
  const path = el as SVGGeometryElement;
  const ctm = path.ownerSVGElement?.getScreenCTM();
  if (!ctm) return null;
  const progress = clamp01(state.progress ? state.progress() : dashProgress(el));
  const at = path.getPointAtLength(progress * path.getTotalLength());
  return {
    x: ctm.a * at.x + ctm.c * at.y + ctm.e,
    y: ctm.b * at.x + ctm.d * at.y + ctm.f,
    progress,
  };
}
