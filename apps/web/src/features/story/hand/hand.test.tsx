import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Annotation } from './Annotation';
import { buildStrokePaths, pressureAt, wobble } from './freehand';
import { arrow, capsuleHalf, loop, pathLength, polygon, wave } from './shapes';
import { ANNOTATIONS, GLYPHS, LOGO_SKETCHES, outlineDrawing } from './strokes';
import type { AnnotationDef, Point } from './types';

const finite = (d: string) => !/NaN|Infinity|undefined/.test(d);

describe('shapes', () => {
  it('arrow ends exactly at the target and the head wraps the tip', () => {
    const a = arrow([0, 0], [100, 50], 10);
    expect(a.shaft[0]).toEqual([0, 0]);
    expect(a.shaft.at(-1)).toEqual([100, 50]);
    expect(a.head.some((p) => p[0] === 100 && p[1] === 50)).toBe(true);
  });

  it('loop overshoots a full turn so the ends cross', () => {
    const pts = loop(0, 0, 10, 5);
    const first = pts[0] as Point;
    const last = pts.at(-1) as Point;
    expect(Math.hypot(last[0] - first[0], last[1] - first[1])).toBeGreaterThan(0.1);
    expect(pathLength(pts)).toBeGreaterThan(2 * Math.PI * 5);
  });

  it('wave starts and ends on its endpoints', () => {
    const pts = wave([0, 0], [50, 0], 2, 3);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.at(-1)?.[0]).toBeCloseTo(50, 6);
  });
});

describe('logo sketches', () => {
  it('polygon closes on its first corner and overshoots it', () => {
    const pts = polygon([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.filter((p) => p[0] === 0 && p[1] === 0).length).toBeGreaterThanOrEqual(2);
    expect(pts.at(-1)?.[0]).toBeGreaterThan(0);
  });

  it('capsule halves stay inside the capsule and meet on the seam', () => {
    for (const half of [0, 1] as const) {
      const pts = capsuleHalf(50, 50, 80, 40, 0, half);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(10 - 0.001);
        expect(x).toBeLessThanOrEqual(90 + 0.001);
        expect(Math.abs(y - 50)).toBeLessThanOrEqual(20 + 0.001);
        // half 0 is the left half, half 1 the right one
        expect(half === 0 ? x <= 50.001 : x >= 49.999).toBe(true);
      }
    }
  });

  it('authors the planned strokes per logo', () => {
    expect(LOGO_SKETCHES.solana.strokes).toHaveLength(3);
    expect(LOGO_SKETCHES.pumpfun.strokes).toHaveLength(2);
    expect(LOGO_SKETCHES.x.strokes).toHaveLength(2);
  });
});

describe('freehand', () => {
  const stroke = { id: 's', points: wave([0, 10], [100, 10], 2, 2), size: 3 } as const;

  it('is deterministic for the same stroke id', () => {
    expect(buildStrokePaths(stroke)).toEqual(buildStrokePaths(stroke));
  });

  it('wobbles differently for a different seed but stays close to the input', () => {
    const a = wobble(stroke.points, 'a');
    const b = wobble(stroke.points, 'b');
    expect(a).not.toEqual(b);
    a.forEach((p, i) => {
      expect(Math.abs(p[1] - (stroke.points[i]?.[1] ?? 0))).toBeLessThan(4);
    });
  });

  it('tapers pressure at both ends', () => {
    expect(pressureAt(0)).toBeLessThan(pressureAt(0.5));
    expect(pressureAt(1)).toBeLessThan(pressureAt(0.5));
  });

  it('produces a closed outline and an open centerline with a length', () => {
    const { outline, center, length } = buildStrokePaths(stroke);
    expect(outline.startsWith('M')).toBe(true);
    expect(outline.endsWith('Z')).toBe(true);
    expect(center.startsWith('M')).toBe(true);
    expect(center.endsWith('Z')).toBe(false);
    expect(finite(outline) && finite(center)).toBe(true);
    expect(length).toBeGreaterThan(90);
  });

  it('every authored drawing builds finite paths', () => {
    const drawings = [
      ...Object.values(ANNOTATIONS),
      ...Object.values(GLYPHS),
      ...Object.values(LOGO_SKETCHES),
      outlineDrawing(120, 48),
      outlineDrawing(180, 48, 6, 9999),
    ];
    for (const d of drawings) {
      for (const s of d.strokes) {
        const { outline, center } = buildStrokePaths(s);
        expect(finite(outline) && finite(center)).toBe(true);
        expect(outline.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('outlineDrawing', () => {
  it('follows a pill: corners of the box stay empty, the caps are round', () => {
    const d = outlineDrawing(180, 48, 6, 9999);
    const pts = d.strokes[0]?.points ?? [];
    const { w, h } = d.viewBox;
    // nothing near the sharp corners of the bounding box
    const nearCorner = pts.some(([x, y]) => Math.hypot(Math.min(x, w - x), Math.min(y, h - y)) < 6);
    expect(nearCorner).toBe(false);
    // the left cap reaches the vertical middle at the far left
    const leftmost = pts.reduce((a, p) => (p[0] < a[0] ? p : a));
    expect(Math.abs(leftmost[1] - h / 2)).toBeLessThan(6);
  });

  it('stays a box for square targets (radius 0)', () => {
    const pts = outlineDrawing(120, 48).strokes[0]?.points ?? [];
    const nearCorner = pts.some(([x, y]) => Math.hypot(x - 2, y - 2) < 2);
    expect(nearCorner).toBe(true);
  });
});

describe('Annotation', () => {
  it('renders one [data-stroke] per stroke with a centerline path each, aria-hidden', () => {
    const { container } = render(<Annotation id="market-odds" />);
    const root = container.querySelector('[data-annotation="market-odds"]');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    const def: AnnotationDef = ANNOTATIONS['market-odds'];
    const strokes = container.querySelectorAll('[data-stroke]');
    expect(strokes).toHaveLength(def.strokes.length);
    for (const g of strokes) {
      expect(g.querySelectorAll('[data-stroke-ink]')).toHaveLength(1);
      const center = g.querySelector('[data-stroke-center]');
      expect(center).toHaveAttribute('pathLength', '1');
      expect(center).toHaveAttribute('stroke-dashoffset', '0');
    }
    expect(strokes[0]).toHaveAttribute('data-stroke', 'market-odds.shaft');
    expect(container.querySelector('[data-annotation-note]')).toHaveTextContent('price = odds');
  });

  it('hides secondary annotations on small screens and keeps primary ones', () => {
    const { container } = render(
      <>
        <Annotation id="outcome-ship" />
        <Annotation id="market-odds" />
      </>,
    );
    expect(container.querySelector('[data-annotation="outcome-ship"]')).toHaveClass('max-md:hidden');
    expect(container.querySelector('[data-annotation="market-odds"]')).not.toHaveClass('max-md:hidden');
  });

  it('gives every stroke mask a unique id', () => {
    const { container } = render(
      <>
        <Annotation id="market-odds" />
        <Annotation id="market-odds" />
      </>,
    );
    const ids = [...container.querySelectorAll('mask')].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
