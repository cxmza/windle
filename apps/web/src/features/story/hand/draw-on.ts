import { gsap } from '@/lib/gsap';
import { EXIT_SPEED, HAND } from '@/lib/motion-tokens';
import { endStroke, startStroke } from './hand-bus';
import { handCanDraw } from './hand-gate';

/**
 * Draw-on for the hand-drawn layer (see HandStroke.tsx for the DOM contract).
 *
 * Builds a timeline that draws every stroke under `root` in DOM order (= authored stroke order), each at pen speed
 * with the `hand` ease, with a short pen lift between strokes, then "writes" the note by wiping its clip left to
 * right. The timeline uses fromTo, so building it immediately hides the drawing; reverting it (useGSAP / matchMedia
 * cleanup) restores the finished drawing, which is also what reduced motion sees because it never builds one.
 */

/** The clip reaches past the note box on every side so Caveat's overhangs and the rotation never get cut. */
const NOTE_HIDDEN = 'inset(-30% 100% -30% -6%)';
const NOTE_SHOWN = 'inset(-30% -6% -30% -6%)';

const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));

export function strokeDuration(length: number): number {
  return clamp(HAND.strokeMin, HAND.strokeMax, length / HAND.speed);
}

export function noteDuration(text: string): number {
  return clamp(HAND.noteMin, HAND.noteMax, text.length * HAND.notePerChar);
}

export type DrawOnOptions = {
  /**
   * Summon the drawing hand (hand-bus.ts) for each stroke and note as it is drawn forward. Default true; the hand
   * itself still stays away on narrow screens, under reduced motion and for drawings that are off-screen
   * (hand-gate.ts). Pass false where something else is already the pen (PencilCursor).
   */
  hand?: boolean;
};

/**
 * Pen down when the tween starts forward, pen up when it completes, is reversed back to its start, or is killed.
 * A stale pen-up (another stroke took the hand over) is ignored by the bus.
 */
function withHand(tween: gsap.core.Tween, el: Element, progress?: () => number): gsap.core.Tween {
  let token: number | null = null;
  const up = () => {
    if (token === null) return;
    endStroke(token);
    token = null;
  };
  tween.eventCallback('onStart', () => {
    if (token === null && handCanDraw(el)) token = startStroke(el, progress ? { progress } : {});
  });
  tween.eventCallback('onComplete', up);
  tween.eventCallback('onReverseComplete', up);
  tween.eventCallback('onInterrupt', up);
  return tween;
}

/** Appends the strokes (and notes) under `root` to `tl`; returns `tl`. */
export function addDrawOn(
  tl: gsap.core.Timeline,
  root: ParentNode,
  position?: gsap.Position,
  { hand = true }: DrawOnOptions = {},
): gsap.core.Timeline {
  const strokes = root.querySelectorAll<SVGGElement>('[data-stroke]');
  const notes = root.querySelectorAll<HTMLElement>('[data-annotation-note]');
  // Pin the natural (finished) values inline first, in one write pass: a fromTo reads its target's current value from
  // the inline style when there is one, from getComputedStyle otherwise — and stroke after stroke that was a forced
  // style recalc each (measured at mount). Same values as the attribute / stylesheet, so nothing changes visually,
  // and reverting the tweens returns to exactly these.
  for (const g of strokes) {
    const center = g.querySelector<SVGPathElement>('[data-stroke-center]');
    if (center) center.style.strokeDashoffset = '0';
  }
  for (const note of notes) note.style.clipPath = 'none';
  const sub = gsap.timeline();
  let first = true;
  for (const g of strokes) {
    const center = g.querySelector<SVGPathElement>('[data-stroke-center]');
    if (!center) continue;
    const gap = first ? 0 : g.dataset.strokeRole === 'head' ? HAND.headGap : HAND.gap;
    const tween = gsap.fromTo(
      center,
      { strokeDashoffset: 1 },
      {
        strokeDashoffset: 0,
        duration: strokeDuration(Number(center.dataset.length) || 0),
        ease: 'hand',
        // the dash runs 1 -> 0 (pathLength=1) and CSSPlugin rounds px by default, which made every stroke pop in
        // whole halfway through its tween instead of drawing
        autoRound: false,
      },
    );
    sub.add(hand ? withHand(tween, center) : tween, first ? 0 : `>+${gap}`);
    first = false;
  }
  for (const note of notes) {
    const tween = gsap.fromTo(
      note,
      { clipPath: NOTE_HIDDEN },
      { clipPath: NOTE_SHOWN, duration: noteDuration(note.textContent ?? ''), ease: 'hand' },
    );
    sub.add(hand ? withHand(tween, note, () => tween.progress()) : tween, first ? 0 : `>+${HAND.gap}`);
    first = false;
  }
  return tl.add(sub, position);
}

/** A paused draw-on timeline for one or more roots, drawn one after another. */
export function drawOn(roots: Iterable<ParentNode>, options: DrawOnOptions = {}): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true });
  let first = true;
  for (const root of roots) {
    addDrawOn(tl, root, first ? 0 : `>+${HAND.gap}`, options);
    first = false;
  }
  return tl;
}

/** Play forward at normal speed. */
export function playDraw(tl: gsap.core.Timeline): void {
  tl.timeScale(1).play();
}

/** Undraw: the same strokes backwards, faster (exits are quieter). */
export function undraw(tl: gsap.core.Timeline): void {
  tl.timeScale(EXIT_SPEED).reverse();
}
