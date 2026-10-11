import { TetrahedronGeometry, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createHalfGeometry() {
  return new RoundedBoxGeometry(0.5, 1, 1, 3, 0.05);
}

export function createSlabGeometry() {
  return new RoundedBoxGeometry(1.6, 0.22, 1.6, 3, 0.07);
}

export function createRingGeometry() {
  return new TorusGeometry(0.95, 0.1, 24, 96);
}

export function createPortalGeometry() {
  return new TorusGeometry(1.6, 0.028, 12, 160);
}

export function createShardGeometry() {
  return new TetrahedronGeometry(0.14, 0);
}

/** Deterministic PRNG so shards fall the same way every time (scrub must be reversible). */
export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShardSeed {
  offset: [number, number, number];
  velocity: [number, number, number];
  spin: [number, number, number];
  size: number;
}

export function createShardSeeds(count: number): ShardSeed[] {
  const rnd = mulberry32(7);
  const range = (a: number, b: number) => a + (b - a) * rnd();
  return Array.from({ length: count }, () => ({
    offset: [range(-0.2, 0.2), range(-0.45, 0.45), range(-0.45, 0.45)],
    velocity: [range(0.2, 1.4), range(0, 0.8), range(-0.6, 0.6)],
    spin: [range(-3, 3), range(-3, 3), range(-3, 3)],
    size: range(0.6, 1.25),
  }));
}
