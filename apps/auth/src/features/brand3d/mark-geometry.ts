import { ExtrudeGeometry, Shape } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export { MARK_PATH } from './mark-path';

type Pt = readonly [number, number];

const BOX = { min: 14, max: 106, radius: 16 } as const;

/** World size of the mark's edge at scale 1, and the heavy slab proportions. */
export const MARK = {
  size: 1.6,
  depth: 0.4,
  /** Hard chamfer: few segments so the bevel reads as flat facets with crisp specular edges. */
  bevel: { thickness: 0.1, size: 0.085, segments: 2 },
  arcSegments: 10,
  /** Smooth across arcs (< ~15deg per step); hard on the notch corners and the chamfer facets. */
  creaseAngle: Math.PI / 14,
} as const;

function arc(cx: number, cy: number, a0: number, a1: number, segments: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 1; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    pts.push([cx + BOX.radius * Math.cos(a), cy + BOX.radius * Math.sin(a)]);
  }
  return pts;
}

/** Outline in box space (y down), clockwise on screen, corner arcs sampled with `arcSegments`. */
export function markOutline(arcSegments: number): Pt[] {
  const h = Math.PI / 2;
  return [
    [30, 14],
    [32.5, 14],
    [44, 58],
    [55.5, 14],
    [64.5, 14],
    [76, 58],
    [87.5, 14],
    [90, 14],
    ...arc(90, 30, -h, 0, arcSegments),
    [106, 90],
    ...arc(90, 90, 0, h, arcSegments).slice(0, -1),
    [90, 106],
    [73.3, 106],
    [60, 70],
    [46.7, 106],
    [30, 106],
    ...arc(30, 90, h, Math.PI, arcSegments),
    [14, 30],
    ...arc(30, 30, Math.PI, Math.PI + h, arcSegments).slice(0, -1),
  ];
}

/** Box space -> world: centred, y up, `MARK.size` across. */
export function toMarkSpace([x, y]: Pt): Pt {
  const k = MARK.size / (BOX.max - BOX.min);
  const c = (BOX.min + BOX.max) / 2;
  return [(x - c) * k, (c - y) * k];
}

/**
 * Extruded mark centred on the origin, facing +z. The bevel is inset (bevelOffset = -bevelSize) so the widest contour
 * is the approved outline itself; an outset bevel would fill the wedge tips.
 */
export function createMarkGeometry() {
  const pts = markOutline(MARK.arcSegments).map(toMarkSpace);
  const shape = new Shape();
  const [p0, ...rest] = pts;
  if (p0) shape.moveTo(p0[0], p0[1]);
  for (const [x, y] of rest) shape.lineTo(x, y);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, {
    depth: MARK.depth,
    bevelEnabled: true,
    bevelThickness: MARK.bevel.thickness,
    bevelSize: MARK.bevel.size,
    bevelOffset: -MARK.bevel.size,
    bevelSegments: MARK.bevel.segments,
    curveSegments: 1,
  });
  geo.translate(0, 0, -MARK.depth / 2);
  const out = toCreasedNormals(geo, MARK.creaseAngle);
  if (out !== geo) geo.dispose();
  out.computeBoundingSphere();
  return out;
}
