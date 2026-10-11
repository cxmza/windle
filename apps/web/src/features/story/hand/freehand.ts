import { getStroke } from 'perfect-freehand';
import { densify, pathLength } from './shapes';
import type { Point, StrokeDef, StrokePaths } from './types';

/**
 * Stroke generation. perfect-freehand returns a FILLED OUTLINE polygon (variable width), not a line, so each
 * stroke yields two paths from the same wobbled points:
 *   outline - what is painted (fill)
 *   center  - the open centerline; motion reveals the outline THROUGH a mask that strokes this path
 *             (stroke-dasharray/offset on pathLength=1), see HandStroke.tsx.
 * Output is deterministic: wobble is seeded by the stroke id, so SSR/tests/screenshots are stable.
 */

const DEFAULT_SIZE = 3;
const WOBBLE_AMPLITUDE = 0.55;

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Low-frequency sideways drift along the stroke, like a hand that is not a plotter. */
export function wobble(points: readonly Point[], seed: string, amplitude = WOBBLE_AMPLITUDE): Point[] {
  const rand = rng(hash(seed));
  const phase = rand() * Math.PI * 2;
  const freq = 0.06 + rand() * 0.05;
  let travelled = 0;
  return points.map((p, i) => {
    const prev = points[i - 1] ?? p;
    const next = points[i + 1] ?? p;
    if (i > 0) travelled += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const off = amplitude * (Math.sin(travelled * freq + phase) + 0.5 * Math.sin(travelled * freq * 2.3 + phase * 1.7));
    return [p[0] + (-ty / len) * off, p[1] + (tx / len) * off];
  });
}

/** Pressure along the stroke: light at both ends, firm in the middle (the taper that makes it read as ink). */
export function pressureAt(t: number): number {
  return 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6;
}

export function outlineToPath(outline: readonly number[][]): string {
  const first = outline[0];
  if (!first) return '';
  let d = `M${round(first[0] ?? 0)} ${round(first[1] ?? 0)}Q`;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (!a || !b) continue;
    const [x0 = 0, y0 = 0] = a;
    const [x1 = 0, y1 = 0] = b;
    d += ` ${round(x0)} ${round(y0)} ${round((x0 + x1) / 2)} ${round((y0 + y1) / 2)}`;
  }
  return `${d}Z`;
}

function centerToPath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return '';
  let d = `M${round(first[0])} ${round(first[1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const n = points[i + 1];
    if (!p || !n) continue;
    d += ` Q${round(p[0])} ${round(p[1])} ${round((p[0] + n[0]) / 2)} ${round((p[1] + n[1]) / 2)}`;
  }
  const last = points[points.length - 1];
  if (last && points.length > 1) d += ` L${round(last[0])} ${round(last[1])}`;
  return d;
}

/** Pure: authored stroke -> outline + centerline path strings. */
export function buildStrokePaths(stroke: StrokeDef, seed = stroke.id): StrokePaths {
  const size = stroke.size ?? DEFAULT_SIZE;
  const dense = densify(stroke.points, 3);
  const wobbled = wobble(dense, seed);
  const total = Math.max(1, wobbled.length - 1);
  const input = wobbled.map(([x, y], i) => [x, y, pressureAt(i / total)]);
  const outline = getStroke(input, {
    size,
    thinning: 0.6,
    smoothing: 0.55,
    streamline: 0.35,
    simulatePressure: false,
    last: true,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  });
  return {
    outline: outlineToPath(outline),
    center: centerToPath(wobbled),
    length: round(pathLength(wobbled)),
  };
}
