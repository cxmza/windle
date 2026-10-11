// Pure math for the logo jelly (approved prototype: windle-jelly.html, variants "Классика" and "Перетяни").
// Everything is in mark units: the mark's 120x120 viewBox, so one tuning works for a 24px dock mark and a 32px
// header mark alike. DOM binding lives in use-jelly.ts.

import { JELLY } from '@/lib/motion-tokens';

export const MARK_BOX = 120;

export interface Spring2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const atRestSpring = (): Spring2D => ({ x: 0, y: 0, vx: 0, vy: 0 });

/** Frame delta in seconds, clamped so a background tab or a long frame cannot blow the spring up. */
export function clampDt(ms: number): number {
  const s = ms / 1000;
  return Number.isFinite(s) && s > 0 ? Math.min(JELLY.maxDt, s) : 1 / 60;
}

/** One semi-implicit Euler step of a damped 2D spring towards the origin (mutates and returns `s`). */
export function stepSpring(s: Spring2D, dt: number, k: number = JELLY.stiffness, c: number = JELLY.damping): Spring2D {
  const ax = -k * s.x - c * s.vx;
  const ay = -k * s.y - c * s.vy;
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  return s;
}

/** Advances the spring by `dt` seconds in fixed sub-steps (frame-rate independent). */
export function advanceSpring(s: Spring2D, dt: number): Spring2D {
  const n = Math.max(1, Math.ceil(dt / JELLY.subStep));
  for (let i = 0; i < n; i++) stepSpring(s, dt / n);
  return s;
}

export function isAtRest(s: Spring2D, eps: number = JELLY.restEps): boolean {
  return Math.hypot(s.x, s.y) < eps && Math.hypot(s.vx, s.vy) < eps;
}

/** Pointer displacement (CSS px) -> mark displacement (units): half the pointer travel, clamped to a radius. */
export function dragOffset(dxPx: number, dyPx: number, markPx: number): { x: number; y: number } {
  const perPx = markPx > 0 ? MARK_BOX / markPx : 0;
  let x = dxPx * perPx * JELLY.follow;
  let y = dyPx * perPx * JELLY.follow;
  const len = Math.hypot(x, y);
  if (len > JELLY.maxOffset) {
    x *= JELLY.maxOffset / len;
    y *= JELLY.maxOffset / len;
  }
  return { x, y };
}

/** Stretch along the displacement: st = min(len / 70, 0.45); scale (1 + st) along it, (1 - 0.55 st) across. */
export function stretchOf(x: number, y: number): { st: number; deg: number } {
  return {
    st: Math.min(Math.hypot(x, y) / JELLY.stretchPer, JELLY.maxStretch),
    deg: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/** CSS transform for the whole mark (origin = centre). Displacement converted from units to px. */
export function dragTransform(s: Spring2D, markPx: number): string {
  const px = markPx / MARK_BOX;
  const { st, deg } = stretchOf(s.x, s.y);
  return `translate(${r(s.x * px)}px, ${r(s.y * px)}px) rotate(${r(deg)}deg) scale(${r(1 + st)}, ${r(1 - st * JELLY.crossStretch)}) rotate(${r(-deg)}deg)`;
}

/**
 * "Классика" squash/stretch as WAAPI keyframes. The prototype ran `j1` over 2.6s with the wobble in 0-48%; here the
 * wobble is the whole animation (offsets rescaled by 1/0.48), so `JELLY.classicMs` is just the active part.
 * `amp` scales every deformation (1 = approved look, 0.5 = the tiny chapter-change nudge).
 */
export function classicKeyframes(amp = 1): Keyframe[] {
  const s = (sx: number, sy: number) => `scale(${r(1 + (sx - 1) * amp)}, ${r(1 + (sy - 1) * amp)})`;
  const k = (d: number) => `skewX(${r(d * amp)}deg)`;
  const span = 0.48;
  const frames: Array<[number, string]> = [
    [0, 'none'],
    [0.08, s(1.2, 0.8)],
    [0.18, `${s(0.86, 1.16)} ${k(-4)}`],
    [0.28, `${s(1.08, 0.93)} ${k(3)}`],
    [0.38, s(0.97, 1.04)],
    [0.48, 'none'],
  ];
  return frames.map(([at, transform]) => ({ offset: r(at / span), transform, easing: JELLY.classicEasing }));
}
