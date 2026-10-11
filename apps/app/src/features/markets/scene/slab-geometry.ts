import { type BufferGeometry, ExtrudeGeometry, Path, PlaneGeometry, Shape, ShapeGeometry } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACE_Z, SLAB } from './scene-tokens';

function roundedRect<T extends Path>(target: T, w: number, h: number, r: number, clockwise = false): T {
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  if (clockwise) {
    target.moveTo(x + rr, y);
    target.absarc(x + rr, y + rr, rr, -Math.PI / 2, -Math.PI, true);
    target.lineTo(x, y + h - rr);
    target.absarc(x + rr, y + h - rr, rr, Math.PI, Math.PI / 2, true);
    target.lineTo(x + w - rr, y + h);
    target.absarc(x + w - rr, y + h - rr, rr, Math.PI / 2, 0, true);
    target.lineTo(x + w, y + rr);
    target.absarc(x + w - rr, y + rr, rr, 0, -Math.PI / 2, true);
    target.closePath();
    return target;
  }
  target.moveTo(x + rr, y);
  target.lineTo(x + w - rr, y);
  target.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
  target.lineTo(x + w, y + h - rr);
  target.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
  target.lineTo(x + rr, y + h);
  target.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false);
  target.lineTo(x, y + rr);
  target.absarc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false);
  target.closePath();
  return target;
}

/**
 * The slab body: extruded rounded rect with a one-segment (hard) chamfer, inset (bevelOffset = -size) so the outer
 * silhouette is exactly width x height. Normals are creased: arcs smooth, chamfer facets crisp (same treatment as the
 * apps/auth W mark).
 */
export function createSlabGeometry(): BufferGeometry {
  const shape = roundedRect(new Shape(), SLAB.width, SLAB.height, SLAB.radius);
  const geo = new ExtrudeGeometry(shape, {
    depth: SLAB.depth,
    bevelEnabled: true,
    bevelThickness: SLAB.bevel.thickness,
    bevelSize: SLAB.bevel.size,
    bevelOffset: -SLAB.bevel.size,
    bevelSegments: 1,
    curveSegments: SLAB.arcSegments,
  });
  geo.translate(0, 0, -SLAB.depth / 2);
  const out = toCreasedNormals(geo, Math.PI / 7);
  if (out !== geo) geo.dispose();
  out.computeBoundingSphere();
  return out;
}

export function createEdgeRingGeometry(band = 0.012): BufferGeometry {
  const inset = SLAB.bevel.size;
  const w = SLAB.width - inset * 2;
  const h = SLAB.height - inset * 2;
  const r = SLAB.radius - inset;
  const outer = roundedRect(new Shape(), w, h, r);
  outer.holes.push(roundedRect(new Path(), w - band * 2, h - band * 2, r - band, true));
  const geo = new ShapeGeometry(outer, SLAB.arcSegments);
  geo.translate(0, 0, FACE_Z + 0.001);
  return geo;
}

export function createBladeGeometry(): BufferGeometry {
  const geo = new PlaneGeometry(1, SLAB.blade.height);
  geo.translate(0.5, 0, 0);
  return geo;
}
