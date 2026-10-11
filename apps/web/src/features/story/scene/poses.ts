import type { SceneKey } from '../chapters';
import { MARK, NARROW_FIT } from './scene-tokens';

/**
 * Pure pose model for the persistent 3D scene. Every scene is a function of its hold progress q (0..1);
 * between chapters the scene blends pose(i, 1) -> pose(i+1, 0) by the chapter's transition progress.
 * No three.js here, so it is unit-testable.
 */
export type Vec3 = [number, number, number];

export interface Xform {
  p: Vec3;
  r: Vec3;
  s: number;
}

export interface Pose {
  /** The windle mark (extruded logo). Field keeps its historical name: it occupies the old monolith's slot. */
  monolith: Xform;
  /** Group of the two glass halves (the "promise"). */
  cube: Xform;
  /** Gap between the halves, cube-local units. */
  split: number;
  /** SHIP half lift, cube-local units. */
  lift: number;
  /** SHIP half emissive 0..1. */
  glow: number;
  /** SLASH half: 0 intact, 1 shards fallen into the dark. */
  shatter: number;
  /** Chrome shackle (collateral). */
  ring: Xform;
  /** Thin chrome torus the camera dives through (judge). */
  portal: Xform;
  slabs: Xform[];
  cam: { p: Vec3; look: Vec3 };
}

/** A free square for the mark, in NDC (y up): centre and height (mark-slots.ts measures it from the DOM). */
export interface MarkSlot {
  x: number;
  y: number;
  h: number;
}

/** A free horizontal band of the stage (NDC, y up): centre and height. Narrow screens only (mark-slots.ts). */
export interface Band {
  y: number;
  h: number;
}

export interface MarkSlots {
  hero?: MarkSlot;
  cta?: MarkSlot;
  /** Narrow: the largest text-free band (above or below the text block) per chapter whose objects are fitted. */
  bands?: Partial<Record<SceneKey, Band>>;
}

export interface LayoutCtx {
  /** Horizontal offset of the object away from the text column (0 on narrow screens). */
  side: number;
  /** Vertical lift so objects sit above the text block on narrow screens. */
  lift: number;
  /** Split-cube placement on the outcome (y, world units; scale). */
  outcome: { y: number; scale: number };
  /** Hero mark placement (y, world units; scale). Defaults: dropped below the layout centre, MARK_SCALE.hero. */
  mark?: { y: number; scale: number };
  /** Measured free squares beside/around the text; when present the mark sits there instead of behind the title. */
  slots?: MarkSlots;
  /** Narrow: measured text-free bands; FITTED chapters scale their composition into them. */
  bands?: MarkSlots['bands'];
  /** Camera projection for turning a slot into world units: tan(fov/2) and aspect (width / height). */
  view?: { tanHalfFov: number; aspect: number };
}

export const SLAB_COUNT = 7;
/** Outcome and final CTA live "beyond the portal": the judge dive carries the camera here. */
export const BEYOND_Z = -10;
/** Cube halves are 0.5 x 1 x 1; centres at ±HALF_OFFSET. */
export const HALF_OFFSET = 0.25;

const EPS = 0.002;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => smoothstep(0, 1, t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const x = (p: Vec3, r: Vec3 = [0, 0, 0], s = 1): Xform => ({ p, r, s });
const hidden = (p: Vec3): Xform => ({ p, r: [0, 0, 0], s: 0 });
const slabHidden = (k: number): Xform => hidden([(k - 3) * 0.6, -3.5, 0]);
const allSlabsHidden = () => Array.from({ length: SLAB_COUNT }, (_, k) => slabHidden(k));

/** Hero camera: starts 8 units back and dollies in with the hold. */
const heroCamZ = (q: number) => 8 - q * 0.8;
/** Final CTA: camera 8 units in front of the mark. */
const CTA_CAM_DIST = 8;

/**
 * Slot (NDC) -> world position and scale for a mark facing a camera on its axis at `dist`, looking at depth `z`.
 * Tracks the hero dolly: the mark holds its place on screen while the camera moves in.
 */
function slotXform(slot: MarkSlot, view: NonNullable<LayoutCtx['view']>, dist: number, z: number, r: Vec3): Xform {
  const halfH = dist * view.tanHalfFov;
  return { p: [slot.x * halfH * view.aspect, slot.y * halfH, z], r, s: (slot.h * halfH) / MARK.size };
}

/** Hero mark drop below the layout centre, world units (keeps its bright upper bevel out from under the title). */
export const HERO_DROP = 0.62;
/** Mark pose scales (geometry is MARK.size across). */
export const MARK_SCALE = { hero: 1.45, cta: 1.3 } as const;

/** Slab geometry: 1.6 x 0.22 x 1.6. */
const SLAB_H = 0.22;
const CUBE = 1; // cube edge before scale

function base(ctx: LayoutCtx, q: number): Pose {
  return {
    monolith: hidden([0, ctx.lift, 0]),
    cube: hidden([ctx.side, ctx.lift, 0]),
    split: 0,
    lift: 0,
    glow: 0,
    shatter: 0,
    ring: hidden([-ctx.side, ctx.lift + 0.35, 0]),
    portal: hidden([0, ctx.lift * 0.5, 0]),
    slabs: allSlabsHidden(),
    cam: { p: [0, 0, heroCamZ(q)], look: [0, 0, 0] },
  };
}

/** Top of a stack of slabs at scale s, k slabs high, plus half a cube of edge c. */
function stackTop(px: number, floor: number, k: number, s: number, c: number, step: number): Vec3 {
  return [px, floor + k * step + (SLAB_H * s) / 2 + (CUBE * c) / 2, 0];
}

const SCENES: Record<SceneKey, (q: number, ctx: LayoutCtx) => Pose> = {
  hero: (q, ctx) => ({
    ...base(ctx, q),
    // the mark faces the reader (the W only reads front-on) and turns a little with the hold; low enough that its
    // bright top bevel lands below the title
    // Measured slot: beside the text column (wide) or above the title (narrow), never behind the title's letters, so
    // the glass can be bright. Fallback (no DOM, tests): the static placement under the title.
    monolith:
      ctx.slots?.hero && ctx.view
        ? slotXform(ctx.slots.hero, ctx.view, heroCamZ(q), 0, [0.12, -0.32 + q * 0.64, 0.02])
        : x(
            [0, ctx.mark?.y ?? ctx.lift - HERO_DROP, 0],
            [0.12, -0.32 + q * 0.64, 0.02],
            ctx.mark?.scale ?? MARK_SCALE.hero,
          ),
  }),

  promise: (q, ctx) => ({
    ...base(ctx, q),
    // the mark condenses into the cube: it shrinks towards the cube's spot while the cube grows there
    monolith: hidden([ctx.side, ctx.lift, 0]),
    cube: x([ctx.side, ctx.lift + 0.1, 0], [0.45 + q * 0.5, 0.6 + q * 1.2, 0.1], 1.25),
    cam: { p: [0, 0, 7.4 - q * 0.4], look: [ctx.side * 0.25, 0, 0] },
  }),

  collateral: (q, ctx) => {
    const cx = -ctx.side;
    const cy = ctx.lift + 0.35;
    const c = 1.05;
    const slabS = 0.85;
    const slabs = allSlabsHidden();
    for (let k = 0; k < 3; k++) {
      slabs[k] = x([cx, cy - (CUBE * c) / 2 - (SLAB_H * slabS) / 2 - 0.02 - k * 0.2, 0], [0, 0.1 * k, 0], slabS);
    }
    return {
      ...base(ctx, q),
      cube: x([cx, cy, 0], [0.35, 0.5 + q * 0.8, 0.05], c),
      // the shackle closes around the cube during the first half of the hold
      ring: x([cx, cy, 0], [1.25, 0.2 + q * 0.4, 0.35], lerp(2.6, 1, smoothstep(0, 0.55, q))),
      slabs,
      cam: { p: [0, 0.3, 7.6], look: [cx * 0.25, 0, 0] },
    };
  },

  market: (q, ctx) => {
    // YES stack 5 slabs, NO stack 2 slabs (≈ 72/28)
    const s = 0.6;
    const step = SLAB_H * s + 0.008;
    const floor = ctx.lift - 1.15;
    const yesX = ctx.side - 0.7;
    const noX = ctx.side + 0.7;
    const slabs = allSlabsHidden();
    for (let k = 0; k < 5; k++) slabs[k] = x([yesX, floor + k * step, 0], [0, 0.05 * k, 0], s);
    for (let k = 0; k < 2; k++) slabs[5 + k] = x([noX, floor + k * step, 0], [0, -0.05 * k, 0], s);
    const c = 0.42;
    const yesTop = stackTop(yesX, floor, 4, s, c, step);
    const noTop = stackTop(noX, floor, 1, s, c, step);
    // hop YES -> NO -> YES, resting at both ends of the hold
    const ph = clamp01((q - 0.1) / 0.8) * 2;
    const k = Math.min(Math.floor(ph), 1);
    const f = ph - k;
    const e = easeInOut(f);
    const from = k === 0 ? yesTop : noTop;
    const to = k === 0 ? noTop : yesTop;
    return {
      ...base(ctx, q),
      ring: hidden([ctx.side, ctx.lift, 0]),
      cube: x(
        add3(lerp3(from, to, e), [0, Math.sin(Math.PI * f) * 0.75, 0]),
        [0, ((k + e) * Math.PI) / 2, -Math.sin(Math.PI * f) * 0.4],
        c,
      ),
      slabs,
      cam: { p: [0, 0.4, 7.2], look: [ctx.side * 0.3, -0.4, 0] },
    };
  },

  incentive: (q, ctx) => {
    // the slabs re-arrange into an ascending staircase; the cube rolls up it
    const s = 0.55;
    const c = 0.38;
    const left = -ctx.side - 1.5;
    const floor = ctx.lift - 1.25;
    const slabs = Array.from({ length: SLAB_COUNT }, (_, k) => x([left + k * 0.5, floor + k * 0.27, 0], [0, 0, 0], s));
    const top = (k: number): Vec3 => [left + k * 0.5, floor + k * 0.27 + (SLAB_H * s) / 2 + (CUBE * c) / 2, 0];
    const ph = clamp01((q - 0.08) / 0.84) * (SLAB_COUNT - 1);
    const k = Math.min(Math.floor(ph), SLAB_COUNT - 2);
    const f = ph - k;
    const e = easeInOut(f);
    return {
      ...base(ctx, q),
      cube: x(
        add3(lerp3(top(k), top(k + 1), e), [0, Math.sin(Math.PI * f) * 0.35, 0]),
        [0, 0.3, (-(k + e) * Math.PI) / 2],
        c,
      ),
      slabs,
      cam: { p: [-0.3, 0.5, 7.6], look: [-ctx.side * 0.3, -0.2, 0] },
    };
  },

  judge: (q, ctx) => ({
    ...base(ctx, q),
    portal: x([0, ctx.lift * 0.5, 0], [0, 0, q * 0.5], 1),
    // the promise waits beyond the portal
    cube: x([0, ctx.lift * 0.5, BEYOND_Z], [0.4, q * 1.5, 0.2], 1),
    cam: { p: [0, 0, 9 - q * 2.5], look: [0, 0, BEYOND_Z] },
  }),

  outcome: (q, ctx) => ({
    ...base(ctx, q),
    // portal stays in place: the camera is already through it
    portal: x([0, ctx.lift * 0.5, 0], [0, 0, 0.5], 1),
    cube: x([0, ctx.outcome.y, BEYOND_Z], [0.12, -0.3 + q * 0.2, 0], ctx.outcome.scale),
    split: smoothstep(0, 0.3, q) * 0.9,
    lift: smoothstep(0.15, 1, q) * 1.1,
    glow: smoothstep(0.2, 0.9, q),
    shatter: clamp01((q - 0.3) / 0.7),
    cam: { p: [0, 0.2, BEYOND_Z + 7.5], look: [0, 0.1, BEYOND_Z] },
  }),

  ecosystem: (q, ctx) => ({
    ...base(ctx, q),
    portal: x([0, ctx.lift * 0.5, 0], [0, 0, 0.5], 1),
    // one focal point: the extruded logos in front. The promise (shards flown back) folds away and re-forms in the CTA.
    cube: hidden([0, ctx.lift * 0.5 - 0.1, BEYOND_Z]),
    cam: { p: [0, 0.15, BEYOND_Z + 8.5], look: [0, 0.1, BEYOND_Z] },
  }),

  cta: (q, ctx) => {
    // the mark reassembles; the promise (cube) sinks into it and becomes its core. Measured slot: clear of the title,
    // the buttons and the status line (contrast); fallback: centred behind them.
    const mark =
      ctx.slots?.cta && ctx.view
        ? slotXform(ctx.slots.cta, ctx.view, CTA_CAM_DIST, BEYOND_Z, [0.1, -0.25 + q * 0.5, 0])
        : x([0, ctx.lift * 0.5 - 0.1, BEYOND_Z], [0.1, -0.25 + q * 0.5, 0], MARK_SCALE.cta);
    return {
      ...base(ctx, q),
      portal: x([0, ctx.lift * 0.5, 0], [0, 0, 0.5], 1),
      monolith: mark,
      cube: x(mark.p, [0.4, q, 0.2], 0.5 * (mark.s / MARK_SCALE.cta) * (1 - smoothstep(0.1, 0.55, q))),
      cam: { p: [0, 0, BEYOND_Z + CTA_CAM_DIST], look: [0, 0, BEYOND_Z] },
    };
  },
};

export const SCENE_ORDER: readonly SceneKey[] = [
  'hero',
  'promise',
  'collateral',
  'market',
  'incentive',
  'judge',
  'outcome',
  'ecosystem',
  'cta',
];

/** Chapters whose objects are fitted into a measured text-free band on narrow screens (the rest have slots). */
export const FITTED: readonly SceneKey[] = ['promise', 'collateral', 'market', 'incentive', 'judge'];
/** Objects at least this far from z = 0 are scenery beyond the portal: never fitted. */
const NEAR_Z = 3;
/** Bounding radius per unit scale (geometry.ts): cube group 1x1x1 (half-diagonal), slab 1.6 wide, ring, portal. */
const RADIUS = { cube: 0.87, slab: 0.82, ring: 1.05, portal: 1.63 } as const;

interface Fit {
  k: number;
  /** Composition centre (world) and where it goes. */
  from: [number, number];
  to: [number, number];
}

const fitCache = new WeakMap<LayoutCtx, Map<SceneKey, Fit | null>>();

/**
 * Narrow screens: scale + move a chapter's composition (as one unit, so the objects keep their relation) into the
 * band. Computed once per layout from the scene's mid- and end-hold poses, so it does not breathe with the hold.
 * Too small a band (the text fills the stage) -> k = 0: no object rather than a tiny one crossing the letters.
 */
function fitFor(key: SceneKey, ctx: LayoutCtx): Fit | null {
  const band = ctx.bands?.[key];
  if (!band || !ctx.view) return null;
  let cache = fitCache.get(ctx);
  if (!cache) {
    cache = new Map();
    fitCache.set(ctx, cache);
  }
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let l = Infinity;
  let r = -Infinity;
  let b = Infinity;
  let t = -Infinity;
  const grow = (o: Xform, radius: number) => {
    if (o.s <= EPS || Math.abs(o.p[2]) > NEAR_Z) return;
    const rr = o.s * radius;
    l = Math.min(l, o.p[0] - rr);
    r = Math.max(r, o.p[0] + rr);
    b = Math.min(b, o.p[1] - rr);
    t = Math.max(t, o.p[1] + rr);
  };
  const ref = SCENES[key](0.5, ctx);
  for (const q of [0.5, 1]) {
    const pose = q === 0.5 ? ref : SCENES[key](q, ctx);
    grow(pose.cube, RADIUS.cube);
    grow(pose.ring, RADIUS.ring);
    grow(pose.portal, RADIUS.portal);
    for (const s of pose.slabs) grow(s, RADIUS.slab);
  }
  let fit: Fit | null = null;
  if (l < r) {
    // the camera looks at cam.look; at the objects' depth one NDC unit is `half` world units
    const [cx, cy, cz] = ref.cam.p;
    const [lx, ly, lz] = ref.cam.look;
    const half = Math.hypot(cx - lx, cy - ly, cz - lz) * ctx.view.tanHalfFov;
    const kH = (band.h * half) / (t - b);
    const kW = (2 * half * ctx.view.aspect * NARROW_FIT.width) / (r - l);
    const k = Math.min(NARROW_FIT.maxScale, kH, kW);
    fit = {
      k: k < NARROW_FIT.minScale ? 0 : k,
      from: [(l + r) / 2, (b + t) / 2],
      to: [lx, ly + band.y * half],
    };
  }
  cache.set(key, fit);
  return fit;
}

function applyFit(o: Xform, f: Fit): Xform {
  if (Math.abs(o.p[2]) > NEAR_Z) return o;
  return {
    p: [f.to[0] + (o.p[0] - f.from[0]) * f.k, f.to[1] + (o.p[1] - f.from[1]) * f.k, o.p[2]],
    r: o.r,
    s: o.s * f.k,
  };
}

export function scenePose(index: number, q: number, ctx: LayoutCtx): Pose {
  const key = SCENE_ORDER[Math.max(0, Math.min(SCENE_ORDER.length - 1, index))] ?? 'hero';
  const pose = SCENES[key](clamp01(q), ctx);
  const f = FITTED.includes(key) ? fitFor(key, ctx) : null;
  if (!f) return pose;
  return {
    ...pose,
    cube: applyFit(pose.cube, f),
    ring: applyFit(pose.ring, f),
    portal: applyFit(pose.portal, f),
    slabs: pose.slabs.map((s) => applyFit(s, f)),
  };
}

/**
 * Handoff blend: an object that appears lags (grows late), one that disappears leads (shrinks early),
 * so two objects never fight for the same frame at full size.
 */
function blendXform(a: Xform, b: Xform, t: number): Xform {
  const appearing = a.s <= EPS && b.s > EPS;
  const leaving = a.s > EPS && b.s <= EPS;
  const te = appearing ? smoothstep(0.4, 1, t) : leaving ? smoothstep(0, 0.6, t) : smoothstep(0, 1, t);
  return { p: lerp3(a.p, b.p, te), r: lerp3(a.r, b.r, te), s: lerp(a.s, b.s, te) };
}

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const te = smoothstep(0, 1, t);
  return {
    monolith: blendXform(a.monolith, b.monolith, t),
    cube: blendXform(a.cube, b.cube, t),
    split: lerp(a.split, b.split, te),
    lift: lerp(a.lift, b.lift, te),
    glow: lerp(a.glow, b.glow, te),
    // shards fly back first, before the cube shrinks into the monolith
    shatter: lerp(a.shatter, b.shatter, smoothstep(0, 0.6, t)),
    ring: blendXform(a.ring, b.ring, t),
    portal: blendXform(a.portal, b.portal, t),
    slabs: a.slabs.map((s, k) => blendXform(s, b.slabs[k] ?? s, t)),
    cam: { p: lerp3(a.cam.p, b.cam.p, te), look: lerp3(a.cam.look, b.cam.look, te) },
  };
}

export function poseAt(chapter: number, hold: number, transition: number, ctx: LayoutCtx): Pose {
  const a = scenePose(chapter, hold, ctx);
  if (transition <= 0 || chapter >= SCENE_ORDER.length - 1) return a;
  return blendPose(a, scenePose(chapter + 1, 0, ctx), transition);
}
