import type { Point } from './types';

/**
 * Pure point generators for authored strokes. They only produce centerlines; the wobble and the pressure
 * taper are added later (freehand.ts) so the data stays readable.
 */

const TAU = Math.PI * 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += distance(a, b);
  }
  return total;
}

/** Straight segments subdivided so that no gap exceeds `step` (keeps wobble smooth along long lines). */
export function densify(points: readonly Point[], step = 4): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a) continue;
    out.push(a);
    if (!b) continue;
    const n = Math.max(1, Math.ceil(distance(a, b) / step));
    for (let k = 1; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  return out;
}

export function quad(a: Point, control: Point, b: Point, samples = 28): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
    ]);
  }
  return out;
}

/** A curved arrow: shaft is a quadratic bend (`bend` = signed offset of the control point from the chord). */
export function arrow(
  from: Point,
  to: Point,
  bend: number,
  head = { length: 11, spread: 0.5 },
): { shaft: Point[]; head: Point[] } {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const control: Point = [mx + (-dy / len) * bend, my + (dx / len) * bend];
  const shaft = quad(from, control, to);
  // tangent at the tip points from the control point to the end
  const angle = Math.atan2(to[1] - control[1], to[0] - control[0]);
  const wing = (side: 1 | -1): Point => [
    to[0] - Math.cos(angle + side * head.spread) * head.length,
    to[1] - Math.sin(angle + side * head.spread) * head.length,
  ];
  // slightly unequal wings read as drawn, not stamped
  const left = wing(1);
  const right = wing(-1);
  const tip: Point = [to[0], to[1]];
  return {
    shaft,
    head: densify([left, tip, [right[0] * 0.98 + to[0] * 0.02, right[1] * 0.98 + to[1] * 0.02]], 2.5),
  };
}

/**
 * A hand loop around a rectangle's centre: a spiral that overshoots its start so the ends cross, like a pen loop.
 * `start` is in radians (0 = right), travelling clockwise on screen.
 */
export function loop(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  turns = 1.12,
  start = -2.4,
  samples = 72,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = start + t * turns * TAU;
    const grow = 1 + 0.06 * t; // radius opens slightly so the ends do not overlap exactly
    out.push([cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow]);
  }
  return out;
}

/** A line with gentle undulation (underlines). */
export function wave(from: Point, to: Point, amplitude: number, waves: number, samples = 36): Point[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const off = Math.sin(t * waves * TAU) * amplitude * Math.sin(Math.PI * t) ** 0.5;
    out.push([lerp(from[0], to[0], t) + nx * off, lerp(from[1], to[1], t) + ny * off]);
  }
  return out;
}

/** Back-and-forth scribble between two points (emphasis, strike-through). */
export function scribble(from: Point, to: Point, amplitude: number, passes: number): Point[] {
  const corners: Point[] = [from];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i <= passes; i++) {
    const t = i / passes;
    const side = i % 2 === 0 ? -1 : 1;
    corners.push([lerp(from[0], to[0], t) + nx * amplitude * side, lerp(from[1], to[1], t) + ny * amplitude * side]);
  }
  corners.push(to);
  return densify(corners, 2.5);
}

/** Points along a rounded-ish rectangle outline, starting at the top-left, slightly overshooting the corner. */
export function boxOutline(x: number, y: number, w: number, h: number): Point[] {
  return densify(
    [
      [x + 0.5, y + 1],
      [x + w, y - 0.5],
      [x + w + 0.5, y + h],
      [x - 0.5, y + h + 0.5],
      [x + 0.5, y - 1],
    ],
    3,
  );
}

/**
 * A rounded-rectangle outline in one pen movement (radius clamped to half the short side, so a pill becomes a
 * capsule). Starts on the top edge just after the top-left corner, runs clockwise and overshoots its start a little,
 * like a hand closing the shape. `radius` 0 degrades to sharp corners.
 */
export function roundedOutline(x: number, y: number, w: number, h: number, radius: number, step = 3): Point[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const corner = (cx: number, cy: number, from: number): Point[] => {
    if (r === 0) return [[cx, cy]];
    const n = Math.max(2, Math.ceil((r * Math.PI) / 2 / step));
    const out: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const a = from + (i / n) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  };
  const right = x + w;
  const bottom = y + h;
  const start: Point = [x + r + 0.5, y + 0.6];
  const pts: Point[] = [
    start,
    ...corner(right - r, y + r, -Math.PI / 2),
    ...corner(right - r, bottom - r, 0),
    ...corner(x + r, bottom - r, Math.PI / 2),
    ...corner(x + r, y + r, Math.PI),
    // overshoot past the start along the top edge, slightly off the first pass
    [x + r + Math.min(10, (w - 2 * r) * 0.15 + 2), y - 0.6],
  ];
  return densify(pts, step);
}

/**
 * A closed polygon drawn in one pen movement: it starts on the first corner, walks every edge and overshoots the
 * start corner a little, like a hand closing a shape.
 */
export function polygon(corners: readonly Point[], step = 3): Point[] {
  const first = corners[0];
  const second = corners[1];
  if (!first || !second) return [...corners];
  const overshoot: Point = [lerp(first[0], second[0], 0.06), lerp(first[1], second[1], 0.06)];
  return densify([...corners, first, overshoot], step);
}

/**
 * One half of a capsule (stadium) outline, in one movement: seam -> straight side -> round cap -> straight side ->
 * back along the seam. The capsule is `length` long, `width` thick, centred on (cx, cy) and rotated by `angle`
 * degrees (clockwise on screen). Half 0 is the start-side half, half 1 the other; together they share the seam.
 */
export function capsuleHalf(
  cx: number,
  cy: number,
  length: number,
  width: number,
  angle: number,
  half: 0 | 1,
  samples = 16,
): Point[] {
  const r = width / 2;
  const straight = length / 2 - r;
  const sign = half === 0 ? -1 : 1;
  const local: Point[] = [[0, -r]];
  local.push([sign * straight, -r]);
  for (let i = 1; i < samples; i++) {
    const a = -Math.PI / 2 + (i / samples) * Math.PI; // -90deg .. +90deg around the cap centre
    local.push([sign * (straight + Math.cos(a) * r), Math.sin(a) * r]);
  }
  local.push([sign * straight, r], [0, r], [0, -r + 0.6]);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return densify(
    local.map((p): Point => [cx + p[0] * cos - p[1] * sin, cy + p[0] * sin + p[1] * cos]),
    3,
  );
}
