import { describe, expect, it } from 'vitest';
import {
  classicAt,
  createDragSpring,
  dragOffset,
  dragStretch,
  isDragAtRest,
  JellyBank,
  jellyMatrix,
  stepDragSpring,
} from './jelly';
import { markOutline, toMarkSpace } from './mark-geometry';
import { JELLY, MARK } from './scene-tokens';

const D = JELLY.classic.duration;
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const at = (m: ArrayLike<number>, i: number) => m[i] ?? Number.NaN;
const apply = (m: ArrayLike<number>, x: number, y: number): [number, number] => [
  at(m, 0) * x + at(m, 4) * y + at(m, 12),
  at(m, 1) * x + at(m, 5) * y + at(m, 13),
];

describe('classic jelly', () => {
  it('is identity outside its span', () => {
    expect(classicAt(0, 1)).toEqual({ sx: 1, sy: 1, skew: 0 });
    expect(classicAt(D, 1)).toEqual({ sx: 1, sy: 1, skew: 0 });
    expect(classicAt(-1, 1)).toEqual({ sx: 1, sy: 1, skew: 0 });
  });

  it('hits the approved keyframes: squash 20%, then stretch 16% with skew', () => {
    const squash = classicAt((8 / 48) * D, 1);
    expect(squash.sx).toBeCloseTo(1.2, 5);
    expect(squash.sy).toBeCloseTo(0.8, 5);
    const stretch = classicAt((18 / 48) * D, 1);
    expect(stretch.sy).toBeCloseTo(1.16, 5);
    expect(stretch.skew).toBeCloseTo(-4, 5);
  });

  it('settles: deviation shrinks wobble after wobble, ~1.2 s total', () => {
    expect(D).toBeGreaterThan(1.1);
    expect(D).toBeLessThan(1.4);
    const peaks = JELLY.classic.keys.slice(1, -1).map((k) => Math.abs(k[2] - 1));
    for (let i = 1; i < peaks.length; i++) expect(at(peaks, i)).toBeLessThan(at(peaks, i - 1));
    // sign alternates: squash, stretch, squash, stretch
    const signs = JELLY.classic.keys.slice(1, -1).map((k) => Math.sign(k[2] - 1));
    expect(signs).toEqual([-1, 1, -1, 1]);
  });

  it('scales by amplitude', () => {
    const half = classicAt((8 / 48) * D, 0.5);
    expect(half.sx).toBeCloseTo(1.1, 5);
    expect(half.sy).toBeCloseTo(0.9, 5);
  });

  it('bank: a second trigger adds to a running one instead of restarting it (no pop)', () => {
    const bank = new JellyBank(2);
    const out = { sx: 1, sy: 1, skew: 0 };
    bank.trigger(1);
    bank.step(0.6 * D);
    const before = { ...bank.sample(out) };
    bank.trigger(1); // new jelly starts at identity: the sum is unchanged at this instant
    expect(bank.sample(out)).toEqual(before);
    bank.step(2 * D);
    expect(bank.active).toBe(false);
    expect(bank.sample(out)).toEqual({ sx: 1, sy: 1, skew: 0 });
  });
});

describe('drag spring', () => {
  it('clamps the held offset and follows half the travel', () => {
    expect(dragOffset(0.1, 0)).toEqual({ x: 0.05, y: 0 });
    const far = dragOffset(3, 4);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(JELLY.drag.maxOffset, 6);
    expect(far.y / far.x).toBeCloseTo(4 / 3, 6);
  });

  it('stretches along the drag and thins across, capped at 45%', () => {
    const st = dragStretch(0.1, 0);
    expect(st.along).toBeCloseTo(1 + 0.1 * (120 / 70), 6);
    expect(st.across).toBeCloseTo(1 - 0.55 * 0.1 * (120 / 70), 6);
    const max = dragStretch(0, 10);
    expect(max.along).toBeCloseTo(1.45, 6);
    expect(max.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(dragStretch(0, 0)).toEqual({ angle: 0, along: 1, across: 1 });
  });

  it('snaps back with overshoot and several wobbles, then rests at exactly zero', () => {
    const s = createDragSpring();
    s.x = JELLY.drag.maxOffset;
    let crossings = 0;
    let minX = 0;
    let prev = s.x;
    let t = 0;
    while (t < 5 && !(t > 0 && isDragAtRest(s))) {
      stepDragSpring(s, 1 / 60);
      t += 1 / 60;
      if (Math.sign(s.x) !== Math.sign(prev) && s.x !== 0) crossings++;
      minX = Math.min(minX, s.x);
      prev = s.x;
    }
    // k 220, c 7: ζ ≈ 0.24 -> first overshoot ≈ 46% of the release offset
    expect(minX / JELLY.drag.maxOffset).toBeLessThan(-0.35);
    expect(crossings).toBeGreaterThanOrEqual(3);
    expect(t).toBeLessThan(3);
    expect(s).toMatchObject({ x: 0, y: 0, vx: 0, vy: 0 });
  });

  it('does not move while held and survives a huge frame delta', () => {
    const s = createDragSpring();
    s.x = 0.2;
    s.held = true;
    stepDragSpring(s, 1 / 60);
    expect(s.x).toBe(0.2);
    s.held = false;
    stepDragSpring(s, 30);
    expect(Number.isFinite(s.x) && Math.abs(s.x) < 1).toBe(true);
  });
});

describe('jellyMatrix', () => {
  const base = { ox: 0, oy: 0, pivotY: -0.8, stretch: dragStretch(0, 0), classic: { sx: 1, sy: 1, skew: 0 } };

  it('is identity at rest', () => {
    expect(jellyMatrix(new Array<number>(16).fill(0), base)).toEqual(identity);
  });

  it('classic squash keeps the bottom edge planted', () => {
    const m = jellyMatrix(new Array<number>(16).fill(0), { ...base, classic: { sx: 1.2, sy: 0.8, skew: -4 } });
    const [bx, by] = apply(m, 0, -0.8);
    expect(bx).toBeCloseTo(0, 6);
    expect(by).toBeCloseTo(-0.8, 6);
    const [, ty] = apply(m, 0, 0.8);
    expect(ty).toBeCloseTo(-0.8 + 1.6 * 0.8, 6);
  });

  it('CSS skewX(-4deg) leans the top to the right on screen', () => {
    const m = jellyMatrix(new Array<number>(16).fill(0), { ...base, classic: { sx: 1, sy: 1, skew: -4 } });
    expect(apply(m, 0, 0.8)[0]).toBeGreaterThan(0);
  });

  it('drag translates and stretches along the drag direction (centred)', () => {
    const stretch = dragStretch(0, 0.2);
    const m = jellyMatrix(new Array<number>(16).fill(0), { ...base, ox: 0, oy: 0.3, stretch });
    const [x0, y0] = apply(m, 0, 0);
    expect([x0, y0]).toEqual([expect.closeTo(0, 6), expect.closeTo(0.3, 6)]);
    const [, yTop] = apply(m, 0, 1);
    expect(yTop - 0.3).toBeCloseTo(stretch.along, 6);
    const [xRight] = apply(m, 1, 0);
    expect(xRight).toBeCloseTo(stretch.across, 6);
  });
});

describe('mark outline', () => {
  it('fits MARK.size centred and keeps the three wedges', () => {
    const pts = markOutline(8).map(toMarkSpace);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-MARK.size / 2, 6);
    expect(Math.max(...xs)).toBeCloseTo(MARK.size / 2, 6);
    expect(Math.min(...ys)).toBeCloseTo(-MARK.size / 2, 6);
    expect(Math.max(...ys)).toBeCloseTo(MARK.size / 2, 6);
    // wedge tips (y up): two top notches reach below the centre-line, the bottom one above
    const tip = (x: number, y: number) => pts.some(([px, py]) => Math.hypot(px - x, py - y) < 1e-9);
    expect(tip(...toMarkSpace([44, 58]))).toBe(true);
    expect(tip(...toMarkSpace([76, 58]))).toBe(true);
    expect(tip(...toMarkSpace([60, 70]))).toBe(true);
    // no duplicate consecutive points (would produce degenerate extrude faces)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] ?? [0, 0];
      const b = pts[(i + 1) % pts.length] ?? [0, 0];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(1e-6);
    }
  });
});
