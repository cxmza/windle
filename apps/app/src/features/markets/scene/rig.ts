/**
 * Critically damped spring, exact step (no overshoot, carries velocity when the target changes mid-flight, so every
 * camera/slab move is interruptible). Mutates `s`; returns true while still moving.
 */
export interface Spring {
  x: number;
  v: number;
}

export const spring = (x = 0): Spring => ({ x, v: 0 });

const EPS_X = 1e-4;
const EPS_V = 1e-3;

export function stepSpring(s: Spring, target: number, omega: number, dt: number): boolean {
  const delta = s.x - target;
  const e = Math.exp(-omega * dt);
  const temp = (s.v + omega * delta) * dt;
  s.x = target + (delta + temp) * e;
  s.v = (s.v - omega * temp) * e;
  if (Math.abs(s.x - target) < EPS_X && Math.abs(s.v) < EPS_V) {
    s.x = target;
    s.v = 0;
    return false;
  }
  return true;
}

/** 0 → 1 → 0 over k ∈ [0, 1]: a quick ease-out rise, then a long quadratic fade. */
export function pulseEnvelope(k: number, rise: number): number {
  if (k <= 0 || k >= 1) return 0;
  if (k < rise) return Math.sin(((k / rise) * Math.PI) / 2);
  return (1 - (k - rise) / (1 - rise)) ** 2;
}

export const clamp = (v: number, max: number): number => Math.max(-max, Math.min(max, v));

export function orbitPosition(
  yaw: number,
  pitch: number,
  r: number,
  pivot: readonly [number, number, number],
  out: [number, number, number],
): [number, number, number] {
  out[0] = pivot[0] + r * Math.sin(yaw) * Math.cos(pitch);
  out[1] = pivot[1] + r * Math.sin(pitch);
  out[2] = pivot[2] + r * Math.cos(yaw) * Math.cos(pitch);
  return out;
}

export function frameSlab(opts: {
  slabW: number;
  slabH: number;
  fov: number;
  aspect: number;
  coverRight: number;
  coverBottom: number;
  coverTop?: number;
  fill: number;
  maxWidthShare: number;
}): { distance: number; offsetX: number; offsetY: number } {
  const tan = Math.tan(((opts.fov / 2) * Math.PI) / 180);
  const top = opts.coverTop ?? 0;
  const freeH = Math.max(0.1, 1 - opts.coverBottom - top);
  const freeW = 1 - opts.coverRight;
  const byHeight = opts.slabH / (opts.fill * freeH * 2 * tan);
  const byWidth = opts.slabW / (opts.maxWidthShare * freeW * 2 * tan * opts.aspect);
  const distance = Math.max(byHeight, byWidth);
  const halfH = distance * tan;
  const halfW = halfH * opts.aspect;
  return { distance, offsetX: opts.coverRight * halfW, offsetY: (top - opts.coverBottom) * halfH };
}
