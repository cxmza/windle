import { BLUE } from '@windle/tokens';

// 3D tokens for the markets scene. three.js cannot parse oklch(), so colours come from the @windle/tokens sRGB mirror;
// only the neutral graphite body is local (same value as apps/auth brand3d/look.ts, the 3D "W" mark).

export const LOOK = {
  body: '#1c2029',
  blue: BLUE[500],
  blueBright: BLUE[600],
  rim: BLUE[700],
  cyan: BLUE[800],
  ice: BLUE[900],
  void: BLUE[50],
  navy: BLUE[100],
  metal: { metalness: 0.78, roughness: 0.38, envMapIntensity: 1.35, clearcoat: 0.5, clearcoatRoughness: 0.18 },
  text: '#eef3fb',
  textMuted: '#8d97a8',
  textBody: '#c3cbd8',
} as const;

export type Strip = {
  color: string;
  intensity: number;
  position: readonly [number, number, number];
  size: readonly [number, number];
};

export const STUDIO: readonly Strip[] = [
  { color: LOOK.blue, intensity: 8, position: [-5.5, 0.5, -3.5], size: [5, 9] },
  { color: LOOK.cyan, intensity: 12, position: [5.2, 1.5, -1.2], size: [0.7, 9] },
  { color: LOOK.ice, intensity: 5, position: [0, 6, 2], size: [6, 0.8] },
  { color: LOOK.blueBright, intensity: 2.6, position: [0, -6, 1], size: [8, 1.6] },
  { color: LOOK.blue, intensity: 1.5, position: [-4.6, -2.2, 3.8], size: [4.2, 7] },
  { color: LOOK.ice, intensity: 1.2, position: [-4, 0.5, 5], size: [0.5, 6] },
  { color: LOOK.ice, intensity: 0.45, position: [0, 3.5, 9], size: [16, 5] },
];

export const SLAB = {
  width: 1.6,
  height: 1,
  radius: 0.14,
  depth: 0.16,
  bevel: { thickness: 0.05, size: 0.05 },
  arcSegments: 8,
  pad: 0.12,
  blade: { height: 0.018, fromBottom: 0.085 },
} as const;

export const FACE_Z = SLAB.depth / 2 + SLAB.bevel.thickness;

export const CAMERA = {
  fov: { wide: 38, narrow: 52 },
  z: 10,
  pivotZ: -4,
  near: 0.1,
  far: 80,
} as const;

export const DEPTH = { nearZ: 3, farZ: -13, minHorizonHours: 48 } as const;

export const SIZE = { min: 0.72, max: 1.3 } as const;

export const SPREAD = { x: 0.86, y: 0.8 } as const;

export const ORBIT = { yawMax: 0.32, pitchMax: 0.14, gain: 0.0035 } as const;

/**
 * Motion. Springs are critically damped (no overshoot: functional UI); omega (1/s) is matched to the CSS duration
 * tokens by settle time (~99% at 6.6 / omega): hover 18 ≈ --dur-base, orbit 9 ≈ --dur-slower, dolly 6.5 ≈ 1 s
 * (a large spatial move; --dur-cinematic is reserved for 3D moves).
 */
export const MOTION = {
  hover: { omega: 18, lift: 0.6, ring: { idle: 0.1, hover: 1 } },
  dimFace: 0.3,
  orbit: { omega: 9 },
  dolly: { omega: 6.5 },
  drift: { yaw: 0.05, pitch: 0.02, yawRate: 0.13, pitchRate: 0.09, bob: 0.05, bobRate: 0.5 },
  idle: { throttleAfter: 4, stopAfter: 45, idleFps: 30 },
  /** A trade on a slab: the blade eases to the new odds (omega 12 ≈ 0.55 s), the body and edge glow once and fade. */
  trade: { bladeOmega: 12, pulse: { ms: 900, rise: 0.18, emissive: 0.16, ring: 0.45 } },
} as const;

export const FRAME = { fill: 0.36, fillNarrow: 0.5, maxWidthShare: 0.8, maxWidthShareNarrow: 0.7 } as const;

export const DPR = { max: 1.75, narrowMax: 1.25 } as const;

export const FOG = { near: 12, far: 32 } as const;
