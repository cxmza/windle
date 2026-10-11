import type { Market } from '../types';
import { CAMERA, DEPTH, SIZE, SPREAD } from './scene-tokens';

export interface Placement {
  id: string;
  rank: number;
  x: number;
  y: number;
  z: number;
  scale: number;
}

type Slot = readonly [sx: number, sy: number];

/**
 * Composition slots in normalised screen space (-1..1 of the visible half extents at each slab's own depth), assigned
 * by deadline rank. Hand-placed so the near (large) slabs never cover each other and far ones fill the gaps; the top
 * and bottom bands stay clear for the nav pill and the legend.
 */
const WIDE: readonly Slot[] = [
  [-0.3, -0.34],
  [0.36, -0.24],
  [-0.66, 0.26],
  [0.12, 0.34],
  [0.74, 0.32],
  [-0.24, 0.62],
  [0.8, -0.58],
  [-0.84, -0.5],
  [0.46, 0.66],
  [-0.62, 0.7],
  [0.02, 0.72],
  [0.26, -0.7],
];

const NARROW: readonly Slot[] = [
  [-0.19, -0.7],
  [0.28, -0.2],
  [-0.47, 0.13],
  [0.47, 0.25],
  [-0.51, 0.5],
  [0.42, 0.58],
  [-0.33, 0.83],
  [0.6, 0.85],
  [-0.7, -0.3],
  [0.74, -0.63],
  [0.05, 0.4],
  [-0.6, -0.55],
];

export const hoursLeft = (m: Market, now: number): number => Math.max(0, (Date.parse(m.deadline) - now) / 3_600_000);

export function depthFor(hours: number, horizon: number): number {
  const t = Math.log1p(Math.max(0, hours)) / Math.log1p(Math.max(horizon, DEPTH.minHorizonHours));
  return DEPTH.nearZ + (DEPTH.farZ - DEPTH.nearZ) * Math.min(1, t);
}

export function scaleFor(collateral: number, min: number, max: number): number {
  if (max <= min) return (SIZE.min + SIZE.max) / 2;
  const t = Math.sqrt(Math.max(0, collateral - min) / (max - min));
  return SIZE.min + (SIZE.max - SIZE.min) * t;
}

export function layoutMarkets(markets: readonly Market[], now: number, aspect: number, fov: number): Placement[] {
  if (markets.length === 0) return [];
  const sorted = [...markets].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const hours = sorted.map((m) => hoursLeft(m, now));
  const horizon = Math.max(...hours);
  const collaterals = sorted.map((m) => m.collateralSol);
  const cMin = Math.min(...collaterals);
  const cMax = Math.max(...collaterals);
  const slots = aspect < 1 ? NARROW : WIDE;
  const tan = Math.tan(((fov / 2) * Math.PI) / 180);

  return sorted.map((m, rank) => {
    const z = depthFor(hours[rank] ?? 0, horizon);
    const halfH = (CAMERA.z - z) * tan;
    const halfW = halfH * aspect;
    const [sx, sy] = slots[rank % slots.length] ?? [0, 0];
    const lap = Math.floor(rank / slots.length);
    return {
      id: m.id,
      rank,
      x: sx * halfW * SPREAD.x,
      y: sy * halfH * SPREAD.y,
      z: z - lap * 1.5,
      scale: scaleFor(m.collateralSol, cMin, cMax),
    };
  });
}
