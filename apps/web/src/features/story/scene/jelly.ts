import { JELLY } from './scene-tokens';

/**
 * Jelly math for the windle mark — pure, no three.js, unit-tested (jelly.test.ts).
 *
 * - Classic: the approved keyframe curve (scale + skew about the bottom edge), sampled by time. Triggers stack
 *   additively in a small bank, so a new trigger never restarts a running one from identity (no pop).
 * - Drag: a 2D damped spring (semi-implicit Euler, fixed sub-steps) that carries velocity, so a release mid-flight
 *   or a re-grab is continuous. While held, the offset follows the pointer directly (spring paused).
 * - jellyMatrix: composes both into one column-major 4x4 for a group with matrixAutoUpdate = false.
 */

export interface ClassicSample {
  sx: number;
  sy: number;
  /** Skew X in degrees, CSS sign convention (y down). */
  skew: number;
}

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

/** Classic jelly at time t (s) with amplitude amp (1 = the approved curve). Identity outside [0, duration]. */
export function classicAt(t: number, amp: number, out: ClassicSample = { sx: 1, sy: 1, skew: 0 }): ClassicSample {
  out.sx = 1;
  out.sy = 1;
  out.skew = 0;
  const { duration, keys } = JELLY.classic;
  if (!(t > 0) || t >= duration || amp === 0) return out;
  const u = t / duration;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (!a || !b || u > b[0]) continue;
    // CSS keyframes with `ease-out`: the timing function applies per segment
    const e = easeOut((u - a[0]) / (b[0] - a[0]));
    out.sx = 1 + amp * (a[1] + (b[1] - a[1]) * e - 1);
    out.sy = 1 + amp * (a[2] + (b[2] - a[2]) * e - 1);
    out.skew = amp * (a[3] + (b[3] - a[3]) * e);
    return out;
  }
  return out;
}

interface Slot {
  t: number;
  amp: number;
}

/** Up to `size` overlapping classic jellies; deviations from identity add up. */
export class JellyBank {
  private readonly slots: Slot[];
  private readonly tmp: ClassicSample = { sx: 1, sy: 1, skew: 0 };

  constructor(size = 2) {
    this.slots = Array.from({ length: size }, () => ({ t: Number.POSITIVE_INFINITY, amp: 0 }));
  }

  trigger(amp: number) {
    // reuse a finished slot, else the oldest
    let pick: Slot | undefined;
    for (const s of this.slots) if (!pick || s.t > pick.t) pick = s;
    if (!pick) return;
    pick.t = 0;
    pick.amp = amp;
  }

  get active(): boolean {
    return this.slots.some((s) => s.t < JELLY.classic.duration);
  }

  step(dt: number) {
    for (const s of this.slots) if (s.t < JELLY.classic.duration) s.t += dt;
  }

  sample(out: ClassicSample): ClassicSample {
    out.sx = 1;
    out.sy = 1;
    out.skew = 0;
    for (const s of this.slots) {
      if (s.t >= JELLY.classic.duration) continue;
      classicAt(s.t, s.amp, this.tmp);
      out.sx += this.tmp.sx - 1;
      out.sy += this.tmp.sy - 1;
      out.skew += this.tmp.skew;
    }
    return out;
  }

  reset() {
    for (const s of this.slots) s.t = Number.POSITIVE_INFINITY;
  }
}

/** 2D spring state; offsets in mark sizes. */
export interface DragSpring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  held: boolean;
}

export function createDragSpring(): DragSpring {
  return { x: 0, y: 0, vx: 0, vy: 0, held: false };
}

/** Advance the release spring. Sub-steps keep a long frame (tab switch, hitch) from blowing it up. */
export function stepDragSpring(s: DragSpring, dt: number) {
  if (s.held) return;
  const { stiffness: k, damping: c } = JELLY.drag;
  let left = Math.min(Math.max(dt, 0), 0.1);
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 240);
    s.vx += (-k * s.x - c * s.vx) * h;
    s.vy += (-k * s.y - c * s.vy) * h;
    s.x += s.vx * h;
    s.y += s.vy * h;
    left -= h;
  }
  if (isDragAtRest(s)) {
    s.x = 0;
    s.y = 0;
    s.vx = 0;
    s.vy = 0;
  }
}

export function isDragAtRest(s: DragSpring): boolean {
  const { restOffset, restVelocity } = JELLY.drag;
  return !s.held && Math.hypot(s.x, s.y) < restOffset && Math.hypot(s.vx, s.vy) < restVelocity;
}

/** Pointer travel (mark sizes) -> held offset: follows a fraction of it, clamped to a radius. */
export function dragOffset(dx: number, dy: number, out: { x: number; y: number } = { x: 0, y: 0 }) {
  const { follow, maxOffset } = JELLY.drag;
  let x = dx * follow;
  let y = dy * follow;
  const len = Math.hypot(x, y);
  if (len > maxOffset) {
    x *= maxOffset / len;
    y *= maxOffset / len;
  }
  out.x = x;
  out.y = y;
  return out;
}

export interface Stretch {
  /** Direction of the offset, radians (y up). */
  angle: number;
  /** Scale along the direction and across it. */
  along: number;
  across: number;
}

/** Offset (mark sizes) -> stretch along its direction: (1 + st, 1 - thin * st), st = min(len * k, max). */
export function dragStretch(x: number, y: number, out: Stretch = { angle: 0, along: 1, across: 1 }): Stretch {
  const { stretchPerSize, maxStretch, thin } = JELLY.drag;
  const st = Math.min(Math.hypot(x, y) * stretchPerSize, maxStretch);
  out.angle = st > 0 ? Math.atan2(y, x) : 0;
  out.along = 1 + st;
  out.across = 1 - thin * st;
  return out;
}

export interface JellyInput {
  /** Drag offset, local units. */
  ox: number;
  oy: number;
  stretch: Stretch;
  classic: ClassicSample;
  /** Classic pivot (the mark's bottom edge), local y. */
  pivotY: number;
}

/**
 * p' = S_drag · (C · (p - pivot) + pivot) + offset, where S_drag = R(θ)·diag(along, across)·R(−θ) is centred on the
 * mark and C = scale(sx, sy)·skewX is pivoted on its bottom edge (CSS `scale() skewX()` order). Z is untouched.
 * Writes a column-major 4x4 (three.js Matrix4.elements layout).
 */
export function jellyMatrix<T extends Float32Array | number[]>(out: T, j: JellyInput): T {
  const { angle, along: a, across: b } = j.stretch;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d00 = c * c * a + s * s * b;
  const d11 = s * s * a + c * c * b;
  const d01 = c * s * (a - b);
  // CSS skewX(φ) with y down = x' = x + tan φ · y_down; in y-up that is x' = x − tan φ · y
  const k = -Math.tan((j.classic.skew * Math.PI) / 180);
  const { sx, sy } = j.classic;
  // C = [[sx, sx·k], [0, sy]]; pivot translation tc = piv − C·piv, piv = (0, py)
  const py = j.pivotY;
  const tcx = -sx * k * py;
  const tcy = py - sy * py;
  // A = S_drag · C
  const a00 = d00 * sx;
  const a01 = d00 * sx * k + d01 * sy;
  const a10 = d01 * sx;
  const a11 = d01 * sx * k + d11 * sy;
  const tx = d00 * tcx + d01 * tcy + j.ox;
  const ty = d01 * tcx + d11 * tcy + j.oy;
  out[0] = a00;
  out[1] = a10;
  out[2] = 0;
  out[3] = 0;
  out[4] = a01;
  out[5] = a11;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = tx;
  out[13] = ty;
  out[14] = 0;
  out[15] = 1;
  return out;
}
