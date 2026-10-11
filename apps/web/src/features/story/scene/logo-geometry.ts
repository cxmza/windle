import { type BufferGeometry, ExtrudeGeometry, Shape } from 'three';
import type { LogoSlotId } from '../chapters';
import { LOGO } from './scene-tokens';

/**
 * Procedural ecosystem marks (no downloaded assets), each fitted into a unit square centred on the origin and
 * extruded towards +z from z = 0 (so scaling z from 0 grows the logo out of the slot plane, towards the viewer).
 * ExtrudeGeometry groups: 0 = caps (face), 1 = sides + bevel.
 */

/** Which material a part takes: `primary` chrome face, `accent` electric-blue face (second half of the pill). */
export type LogoPartTone = 'primary' | 'accent';

export interface LogoPart {
  geometry: BufferGeometry;
  tone: LogoPartTone;
}

type Pt = readonly [number, number];

function polygon(points: readonly Pt[]): Shape {
  const s = new Shape();
  const [p0, ...ps] = points;
  if (!p0) return s;
  s.moveTo(p0[0], p0[1]);
  for (const [x, y] of ps) s.lineTo(x, y);
  s.closePath();
  return s;
}

const BEVEL = { thickness: 0.035, size: 0.025 } as const;

function extrude(shapes: Shape | Shape[]): BufferGeometry {
  const g = new ExtrudeGeometry(shapes, {
    depth: LOGO.extrude,
    bevelEnabled: true,
    bevelThickness: BEVEL.thickness,
    bevelSize: BEVEL.size,
    bevelSegments: 3,
    curveSegments: 24,
  });
  g.translate(0, 0, BEVEL.thickness);
  return g;
}

/** Solana: three slanted parallelogram bars; top and bottom slant one way ("/"), the middle the other ("\"). */
function solana(): LogoPart[] {
  const w = 1;
  const h = 0.2;
  const gap = 0.15;
  const s = 0.2;
  const bar = (y: number, slant: 1 | -1): Shape =>
    slant === 1
      ? polygon([
          [-w / 2, y],
          [w / 2 - s, y],
          [w / 2, y + h],
          [-w / 2 + s, y + h],
        ])
      : polygon([
          [-w / 2 + s, y],
          [w / 2, y],
          [w / 2 - s, y + h],
          [-w / 2, y + h],
        ]);
  const top = h / 2 + gap;
  return [{ geometry: extrude([bar(top, 1), bar(-h / 2, -1), bar(-top - h, 1)]), tone: 'primary' }];
}

/** pump.fun: a pill tilted 45°, split across its middle into two halves (one chrome, one electric blue). */
function pump(): LogoPart[] {
  const r = 0.22;
  const len = 1.18;
  const a = len / 2 - r;
  const gap = 0.018;
  const half = (dir: 1 | -1): Shape => {
    const s = new Shape();
    const x0 = dir * gap;
    s.moveTo(x0, -r);
    s.lineTo(dir * a, -r);
    // the round end: centre (dir·a, 0), from the bottom to the top through the far side
    s.absarc(dir * a, 0, r, -Math.PI / 2, Math.PI / 2, dir === -1);
    s.lineTo(x0, r);
    s.closePath();
    return s;
  };
  const tilt = Math.PI / 4;
  const a1 = extrude(half(1));
  const a2 = extrude(half(-1));
  a1.rotateZ(tilt);
  a2.rotateZ(tilt);
  return [
    { geometry: a1, tone: 'accent' },
    { geometry: a2, tone: 'primary' },
  ];
}

/** X: a thick stroke top-left -> bottom-right, a thin one bottom-left -> top-right, cut where it meets the thick. */
function xMark(): LogoPart[] {
  const tw = 0.27;
  const hw = 0.05;
  const cut = 0.15;
  const thick = polygon([
    [-0.5, 0.5],
    [-0.5 + tw, 0.5],
    [0.5, -0.5],
    [0.5 - tw, -0.5],
  ]);
  const thin = (from: number, to: number) =>
    polygon([
      [from - hw, from],
      [from + hw, from],
      [to + hw, to],
      [to - hw, to],
    ]);
  return [{ geometry: extrude([thick, thin(-0.5, -cut), thin(cut, 0.5)]), tone: 'primary' }];
}

export function createLogoParts(): Record<LogoSlotId, LogoPart[]> {
  return { solana: solana(), pumpfun: pump(), x: xMark() };
}
