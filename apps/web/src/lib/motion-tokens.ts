// JS mirrors of the motion tokens in @windle/tokens (packages/tokens/src/tokens.css) (keep in sync).
// GSAP and three.js cannot read CSS custom properties per frame, so they read these.

/** Seconds. Mirrors --dur-* (ms) in tokens.css. */
export const DUR = {
  instant: 0.1,
  fast: 0.18,
  base: 0.26,
  slow: 0.42,
  slower: 0.7,
  /** 3D spatial moves (object arriving from depth). Mirrors --dur-cinematic. */
  cinematic: 1.4,
} as const;

/** Mirrors --ease-* in tokens.css. Registered as GSAP eases of the same name in lib/gsap.ts. */
export const EASE_BEZIER = {
  standard: [0.2, 0, 0, 1],
  decelerate: [0.05, 0.7, 0.1, 1],
  accelerate: [0.3, 0, 0.8, 0.15],
  /** Pen stroke: fast middle, slight ease at both ends. Mirrors --ease-hand. */
  hand: [0.4, 0.05, 0.3, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type EaseName = keyof typeof EASE_BEZIER;

/** Stagger per item, seconds (skill: 30-60ms per item; chars go faster because there are many). */
export const STAGGER = {
  char: 0.018,
  line: 0.06,
  item: 0.06,
  /** Cap on a whole char sequence (a title): per-char stagger shrinks so the cascade never exceeds this. */
  charSpan: 0.45,
  /** Cap on the hero kicker sweep (a short label: quicker than a title). */
  kickerSpan: 0.28,
} as const;

/** Exits are quieter: reverse at this speed multiple (~60% of the enter duration). */
export const EXIT_SPEED = 1.6;

/** Hero intro choreography offsets, seconds from mount. */
export const INTRO = {
  kicker: 0,
  title: 0.1,
  sub: 0.55,
  cta: 0.7,
  object: 0.15,
} as const;

/** Entrance offset in px. Mirrors --distance-enter. */
export const DISTANCE_ENTER = 16;

/**
 * One gesture rule for every draggable mark (2D header/dock marks and the 3D scene mark), so a press means the same
 * thing everywhere. Mouse/pen: a drag starts after `slopPx` of travel; less is a click/tap. Touch: the finger must
 * rest `touchHoldMs` within `slopPx` before a drag claims it; moving earlier is a page scroll.
 */
export const DRAG_GESTURE = {
  slopPx: 6,
  touchHoldMs: 200,
} as const;

/**
 * Logo jelly (brand/jelly.ts), lifted from the user-approved prototype windle-jelly.html. Lengths are in mark units
 * (the 120x120 viewBox), so they scale with the rendered mark size.
 */
export const JELLY = {
  /** "Классика" wobble length, ms (prototype: 48% of a 2.6s loop). */
  classicMs: 1250,
  /** Per-segment easing of the prototype's `animation: j1 ... ease-out`. */
  classicEasing: 'ease-out',
  /** Chapter-change nudge: deformation share of the full classic. */
  nudgeAmp: 0.5,
  /** Hover dwell before the classic plays (filters fly-overs), ms. */
  hoverIntentMs: 120,
  /** "Перетяни" 2D spring. */
  stiffness: 220,
  damping: 7,
  /** Mark follows half of the pointer travel, clamped to this radius. */
  follow: 0.5,
  maxOffset: 38,
  /** st = min(len / stretchPer, maxStretch); cross axis shrinks by crossStretch * st. */
  stretchPer: 70,
  maxStretch: 0.45,
  crossStretch: 0.55,
  restEps: 0.05,
  /** Longest frame the sim catches up on, s (longer gaps, e.g. a background tab, are dropped). */
  maxDt: 0.25,
  /** Integration sub-step, s: keeps the spring stable and wall-clock true at any frame rate. */
  subStep: 1 / 120,
} as const;

/**
 * Hand-drawn layer timing (seconds unless noted). Strokes draw at a pen speed in viewBox units, clamped so a
 * tiny arrow head is not instant and a long loop does not drag; notes are "written" left to right at a per-char pace.
 */
export const HAND = {
  /** viewBox units per second along a stroke's centerline. */
  speed: 300,
  strokeMin: DUR.instant,
  strokeMax: DUR.slower,
  /** Pen lift between strokes. */
  gap: 0.09,
  /** Shorter lift before an arrow head (same gesture). */
  headGap: 0.04,
  notePerChar: 0.04,
  noteMin: DUR.base,
  noteMax: DUR.slower,
  /** Pencil trail lifetime in ms and its point budget. */
  trailMs: 400,
  trailPoints: 32,
} as const;
