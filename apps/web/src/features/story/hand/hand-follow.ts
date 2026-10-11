import { gsap } from '@/lib/gsap';
import { DUR } from '@/lib/motion-tokens';
import { getHandState, subscribeHand } from './hand-bus';
import { type Tip, tipOf } from './stroke-tip';

/**
 * The drawing hand's motion, outside React (one rAF loop, transform + opacity writes only, no state per frame).
 *
 *   hidden ──startStroke──▶ on       slides in from off to the lower right of the tip (opacity fades in), then
 *                                    tracks the tip with a critically damped spring
 *   on ──endStroke───────▶ hover     pen lifted in place (scale up, rise); a next stroke within `hold` = a hop
 *   hover ──after hold───▶ leaving   drifts off to the lower right, accelerating, and fades
 *   leaving ──done───────▶ hidden    the loop stops until the bus wakes it up again
 *
 * The spring lives in the tip's frame: the state is the hand's OFFSET from the tip (and its rate), decaying to zero
 * critically damped. While a stroke is drawn the offset is zero, so the nib sits exactly on the ink whatever the pen
 * speed; a jump of the tip (entry, a hop to the next stroke) becomes an offset that eases out — that is the lag. A drawing that leaves the viewport, or a stroke that stops advancing (its timeline was reverted
 * without a pen-up), makes the hand leave as if the pen were lifted.
 */
export const FOLLOW = {
  /** Spring angular frequency, rad/s: ~0.2s to settle a hop. */
  omega: 30,
  /** Farther than this from the tip (px), the pen is in the air. */
  liftDistance: 14,
  /** Pen-up pose: scale and rise in px. */
  liftScale: 0.05,
  liftRise: 6,
  /** Lift smoothing time constant, s. */
  liftTau: 0.08,
  /** Tilt along the direction of travel: degrees per px/s, capped, smoothed. */
  tiltPerSpeed: 0.008,
  tiltMax: 7,
  tiltTau: 0.12,
  /** Hover after a pen-up before leaving, s: longer than any gap between strokes of one drawing sequence. */
  hold: DUR.slow,
  /** A stroke whose progress has not changed for this long is treated as abandoned, s. */
  stall: 1,
  /** Enter from / exit towards this offset from the tip, px (lower right: the side a right hand rests on). */
  away: { x: 280, y: 240 },
  /** Tip farther than this outside the viewport counts as off-screen, px. */
  offscreen: 24,
  /** Frame step cap, s: after a background tab or a long frame the hand resumes instead of teleporting. */
  maxDt: 0.1,
  /**
   * Hand poses, degrees around the nib, in order of preference: 0 = the art as drawn (palm up-right of the point),
   * 45 = forearm level to the right, 75 = swung clockwise (palm down-right, the forearm comes in from below). The first pose whose silhouette clears
   * every `[data-hand-avoid]` box is used; if none clears, the hand veils out (the stroke keeps drawing).
   */
  poses: [0, 45, 75],
  /** Text the hand must never cover (small print: the trade summary, the demo disclaimer). Fixed site chrome sits above the hand layer instead (--z-hand). */
  avoidSelector: '[data-hand-avoid]',
  /** Clearance around an avoided box, px. */
  avoidPad: 8,
  /** Pose swing and veil smoothing time constants, s. */
  poseTau: 0.12,
  veilTau: 0.06,
} as const;

type Vec = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number };

/** Axis-aligned bounds of `hull` (px around the nib) rotated by `deg` about the nib placed at `at`. */
export function hullBounds(hull: readonly Vec[], deg: number, at: Vec): Box {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const box: Box = { left: at.x, top: at.y, right: at.x, bottom: at.y };
  for (const p of hull) {
    const x = at.x + p.x * cos - p.y * sin;
    const y = at.y + p.x * sin + p.y * cos;
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  }
  return box;
}

/** `hull` (px around the nib) rotated by `deg` about the nib placed at `at`. */
function placeHull(hull: readonly Vec[], deg: number, at: Vec): Vec[] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return hull.map((p) => ({ x: at.x + p.x * cos - p.y * sin, y: at.y + p.x * sin + p.y * cos }));
}

/** Separating-axis test: does the convex polygon `poly` touch `box` grown by `pad`? */
function hitsBox(poly: readonly Vec[], box: Box, pad: number): boolean {
  const l = box.left - pad;
  const r = box.right + pad;
  const t = box.top - pad;
  const b = box.bottom + pad;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (maxX < l || minX > r || maxY < t || minY > b) return false;
  const corners = [
    { x: l, y: t },
    { x: r, y: t },
    { x: r, y: b },
    { x: l, y: b },
  ];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (!p || !q) continue;
    const nx = q.y - p.y;
    const ny = p.x - q.x;
    let pMin = Number.POSITIVE_INFINITY;
    let pMax = Number.NEGATIVE_INFINITY;
    for (const v of poly) {
      const d = v.x * nx + v.y * ny;
      pMin = Math.min(pMin, d);
      pMax = Math.max(pMax, d);
    }
    let bMin = Number.POSITIVE_INFINITY;
    let bMax = Number.NEGATIVE_INFINITY;
    for (const v of corners) {
      const d = v.x * nx + v.y * ny;
      bMin = Math.min(bMin, d);
      bMax = Math.max(bMax, d);
    }
    if (pMax < bMin || bMax < pMin) return false;
  }
  return true;
}

/** True when the hand (convex `hull` around the nib) at angle `deg`, nib at `at`, keeps clear of every box. */
export function poseClear(
  hull: readonly Vec[],
  deg: number,
  at: Vec,
  boxes: readonly Box[],
  pad: number = FOLLOW.avoidPad,
): boolean {
  if (boxes.length === 0) return true;
  const poly = placeHull(hull, deg, at);
  return boxes.every((box) => !hitsBox(poly, box, pad));
}

/**
 * Index of the first pose in `poses` that keeps clear of every box, preferring `current` while it still clears
 * (no flip-flopping between poses); -1 when none clears.
 */
export function pickPose(
  hull: readonly Vec[],
  poses: readonly number[],
  at: Vec,
  boxes: readonly Box[],
  current: number,
  pad: number = FOLLOW.avoidPad,
): number {
  const clear = (i: number) => {
    const deg = poses[i];
    return deg !== undefined && poseClear(hull, deg, at, boxes, pad);
  };
  if (current >= 0 && clear(current)) return current;
  for (let i = 0; i < poses.length; i++) if (clear(i)) return i;
  return -1;
}

export type Phase = 'hidden' | 'on' | 'hover' | 'leaving';
/** Hand position = tip + `e`; `de` is the rate of `e`. */
export type Offset = { e: Vec; de: Vec };

/**
 * Advances the critically damped offset decay by `dt` with the exact closed-form solution
 * (e(t) = (e0 + (de0 + w e0) t) e^(-wt)), so it is stable for any frame time; mutates and returns `s`.
 */
export function stepOffset(s: Offset, dt: number, omega: number = FOLLOW.omega): Offset {
  const decay = Math.exp(-omega * dt);
  for (const axis of ['x', 'y'] as const) {
    const e0 = s.e[axis];
    const de0 = s.de[axis];
    const b = de0 + omega * e0;
    s.e[axis] = (e0 + b * dt) * decay;
    s.de[axis] = (de0 - omega * b * dt) * decay;
  }
  return s;
}

const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));
const approach = (from: number, to: number, dt: number, tau: number) => from + (to - from) * (1 - Math.exp(-dt / tau));

function onScreen(tip: Tip): boolean {
  const m = FOLLOW.offscreen;
  return tip.x > -m && tip.y > -m && tip.x < window.innerWidth + m && tip.y < window.innerHeight + m;
}

/**
 * Drives `body` (the positioned hand) from the hand bus. `nib` is the pencil point in px inside `body`; transforms
 * pivot there, so tilt, pose and lift never move the point off the tip. `hull` is the art's silhouette in px around
 * the nib (for keeping clear of `[data-hand-avoid]`; empty = no avoidance). Returns the cleanup.
 */
export function followHand(body: HTMLElement, nib: Vec, hull: readonly Vec[] = []): () => void {
  const enterEase = gsap.parseEase('decelerate');
  const exitEase = gsap.parseEase('accelerate');
  const offset: Offset = { e: { x: 0, y: 0 }, de: { x: 0, y: 0 } };
  const target: Vec = { x: 0, y: 0 };
  /** Drawn position and its smoothed velocity (for the tilt). */
  const pos: Vec = { x: 0, y: 0 };
  const vel: Vec = { x: 0, y: 0 };
  let phase: Phase = 'hidden';
  let raf = 0;
  let last = 0;
  let lift = 1;
  let tilt = 0;
  let opacity = 0;
  let fadeFrom = 0;
  let fadeStart = 0;
  let phaseSince = 0;
  let leaveFrom: Vec = { x: 0, y: 0 };
  let token = -1;
  let prevTip: Tip | null = null;
  let progressAt = 0;
  /** Chosen pose index (-1 = none clears: veiled), its smoothed angle, and the veil (1 = shown, 0 = veiled). */
  let pose = 0;
  let poseDeg = 0;
  let veil = 1;
  let avoid: HTMLElement[] = [];

  /** Avoided boxes currently on screen (read once per frame, before any write). */
  const boxes: Box[] = [];
  const readBoxes = () => {
    boxes.length = 0;
    for (const el of avoid) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) boxes.push(r);
    }
  };
  /** Picks the pose for the nib at `at` against `boxes`. */
  const choosePose = (at: Vec) => {
    pose = hull.length === 0 ? 0 : pickPose(hull, FOLLOW.poses, at, boxes, pose);
  };

  body.style.transformOrigin = `${nib.x}px ${nib.y}px`;

  const setPhase = (next: Phase, now: number) => {
    phase = next;
    phaseSince = now;
    body.dataset.handPhase = next;
  };

  /** The tip to follow this frame, or null when the hand should not be drawing. */
  const activeTip = (now: number): Tip | null => {
    const state = getHandState();
    if (state.status !== 'drawing' || !state.el.isConnected) return null;
    const tip = tipOf(state);
    if (!tip) return null;
    if (state.token !== token || !prevTip || tip.progress !== prevTip.progress) progressAt = now;
    if (now - progressAt > FOLLOW.stall * 1000) return null;
    return onScreen(tip) ? tip : null;
  };

  const frame = (now: number) => {
    const dt = last ? clamp(0, FOLLOW.maxDt, (now - last) / 1000) : 0;
    last = now;
    const state = getHandState();
    const tip = activeTip(now);

    if (tip && state.status === 'drawing') {
      if (phase === 'hidden' || phase === 'leaving') {
        if (phase === 'hidden') {
          pos.x = tip.x + FOLLOW.away.x;
          pos.y = tip.y + FOLLOW.away.y;
          vel.x = 0;
          vel.y = 0;
          lift = 1;
          // enter already in the pose that clears the small print (no swing on arrival)
          avoid = Array.from(document.querySelectorAll<HTMLElement>(FOLLOW.avoidSelector));
          readBoxes();
          pose = -1;
          choosePose(tip);
          poseDeg = FOLLOW.poses[Math.max(0, pose)] ?? 0;
          veil = pose < 0 ? 0 : 1;
        }
        // continue from wherever the hand is now (off-screen, mid-exit): that distance is the offset to ease out
        offset.e = { x: pos.x - tip.x, y: pos.y - tip.y };
        target.x = tip.x;
        target.y = tip.y;
        offset.de = { x: 0, y: 0 };
        fadeFrom = opacity;
        fadeStart = now;
      }
      if (phase !== 'on') setPhase('on', now);
      // a new stroke (pen hop) or the first frame after a hover: the tip jumped, the hand did not
      if (state.token !== token || !prevTip) {
        offset.e.x += target.x - tip.x;
        offset.e.y += target.y - tip.y;
      }
      token = state.token;
      prevTip = tip;
      target.x = tip.x;
      target.y = tip.y;
    } else {
      prevTip = null;
      if (phase === 'on') {
        setPhase('hover', now);
      } else if (phase === 'hover' && now - phaseSince > FOLLOW.hold * 1000) {
        leaveFrom = { ...pos };
        fadeFrom = opacity;
        setPhase('leaving', now);
      }
    }

    if (phase === 'leaving') {
      const t = clamp(0, 1, (now - phaseSince) / (DUR.base * 1000));
      const e = exitEase(t);
      pos.x = leaveFrom.x + FOLLOW.away.x * e;
      pos.y = leaveFrom.y + FOLLOW.away.y * e;
      opacity = fadeFrom * (1 - e);
      if (t >= 1) setPhase('hidden', now);
    } else if (phase !== 'hidden') {
      stepOffset(offset, dt);
      const x = target.x + offset.e.x;
      const y = target.y + offset.e.y;
      if (dt > 0) {
        vel.x = approach(vel.x, (x - pos.x) / dt, dt, FOLLOW.tiltTau);
        vel.y = approach(vel.y, (y - pos.y) / dt, dt, FOLLOW.tiltTau);
      }
      pos.x = x;
      pos.y = y;
      opacity = fadeFrom + (1 - fadeFrom) * enterEase(clamp(0, 1, (now - fadeStart) / (DUR.fast * 1000)));
    }

    // Pose: swing towards the chosen pose; the hand is shown only while the angle it is drawn at clears the small
    // print, so a swing that would sweep across text veils instead (and, once veiled, snaps to the new pose).
    if (phase !== 'hidden') readBoxes();
    if (phase === 'on' || phase === 'hover') choosePose(target);
    const goal = pose < 0 ? poseDeg : (FOLLOW.poses[pose] ?? 0);
    poseDeg = veil < 0.02 ? goal : approach(poseDeg, goal, dt, FOLLOW.poseTau);
    const shown = pose >= 0 && poseClear(hull, poseDeg, pos, boxes);
    veil = approach(veil, shown ? 1 : 0, dt, FOLLOW.veilTau);

    const away = Math.hypot(offset.e.x, offset.e.y);
    lift = approach(lift, phase === 'on' && away < FOLLOW.liftDistance ? 0 : 1, dt, FOLLOW.liftTau);
    // moving right/down swings the forearm clockwise a touch; moving left/up, the other way
    const want = clamp(-FOLLOW.tiltMax, FOLLOW.tiltMax, (vel.x + 0.5 * vel.y) * FOLLOW.tiltPerSpeed);
    tilt = approach(tilt, phase === 'on' ? want : 0, dt, FOLLOW.tiltTau);

    if (phase === 'hidden') {
      opacity = 0;
      body.style.opacity = '0';
    } else {
      const x = pos.x - nib.x;
      const y = pos.y - nib.y - lift * FOLLOW.liftRise;
      body.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${(poseDeg + tilt).toFixed(2)}deg) scale(${(1 + lift * FOLLOW.liftScale).toFixed(4)})`;
      body.style.opacity = (opacity * veil).toFixed(3);
    }

    // sleep when nothing is on screen and nothing will be (idle bus, or a stroke the hand has given up on)
    if (phase === 'hidden' && !tip) {
      raf = 0;
      last = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (raf || getHandState().status !== 'drawing') return;
    raf = requestAnimationFrame(frame);
  };

  body.dataset.handPhase = phase;
  body.style.opacity = '0';
  const unsubscribe = subscribeHand(wake);
  wake();
  return () => {
    unsubscribe();
    cancelAnimationFrame(raf);
    raf = 0;
  };
}
