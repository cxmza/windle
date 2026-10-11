import { ExtrudeGeometry, Shape } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MARK } from './scene-tokens';

/**
 * The windle "notch" mark, approved outline (120 x 120 box, y down):
 * M30 14 H32.5 L44 58 L55.5 14 H64.5 L76 58 L87.5 14 H90 A16 16 0 0 1 106 30 V90 A16 16 0 0 1 90 106
 * H73.3 L60 70 L46.7 106 H30 A16 16 0 0 1 14 90 V30 A16 16 0 0 1 30 14 Z
 * Rounded square 14..106 with two wedges cut from the top edge and one from the bottom: a W in negative space.
 */
type Pt = readonly [number, number];

const BOX = { min: 14, max: 106, radius: 16 } as const;

/** Corner arc from angle a0 to a1 (radians, y-down box space) around (cx, cy); excludes the start point. */
function arc(cx: number, cy: number, a0: number, a1: number, segments: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 1; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    pts.push([cx + BOX.radius * Math.cos(a), cy + BOX.radius * Math.sin(a)]);
  }
  return pts;
}

/** Outline in box space (y down), clockwise on screen, arcs sampled with `arcSegments` per corner. Pure; tested. */
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
 * Extruded mark centred on the origin (x, y, and z), facing +z. The bevel is inset (bevelOffset = -bevelSize) so the
 * widest contour is the approved outline itself: an outset bevel would fill the wedge tips. Normals are creased:
 * smooth over arcs and bevel rings, hard on the notch corners and the cap/side edges beyond the crease angle.
 */
export function createMarkGeometry(tier: 'high' | 'low') {
  const seg = MARK.segments[tier];
  const pts = markOutline(seg.arc).map(toMarkSpace);
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
    bevelSegments: seg.bevel,
    curveSegments: 1,
  });
  geo.translate(0, 0, -MARK.depth / 2);
  const out = toCreasedNormals(geo, MARK.creaseAngle);
  if (out !== geo) geo.dispose();
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
