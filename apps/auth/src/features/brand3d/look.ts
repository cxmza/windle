import { BLUE } from '@windle/tokens';

/**
 * Look of the 3D mark: black/graphite metal lit by hard electric-blue and cyan strips. three.js cannot read oklch(),
 * so colours come from the @windle/tokens sRGB mirror; only the neutral graphite body is local to this scene.
 */
export const LOOK = {
  body: '#1c2029',
  blue: BLUE[500],
  blueBright: BLUE[600],
  cyan: BLUE[800],
  ice: BLUE[900],
  void: BLUE[50],
  metal: { metalness: 0.8, roughness: 0.36, envMapIntensity: 1.5, clearcoat: 0.5, clearcoatRoughness: 0.16 },
} as const;

/** One emissive strip of the studio the metal reflects. Positions are around the origin, intensities are HDR. */
export type Strip = {
  color: string;
  intensity: number;
  position: readonly [number, number, number];
  size: readonly [number, number];
};

export const STUDIO: readonly Strip[] = [
  // The single big blue light behind the mark, wrapping its left flank.
  { color: LOOK.blue, intensity: 9, position: [-5.5, 0.5, -3.5], size: [5, 9] },
  // Hard cyan blade on the right: the crisp specular line along the bevel.
  { color: LOOK.cyan, intensity: 14, position: [5.2, 1.5, -1.2], size: [0.7, 9] },
  // Top strip: lights the upper chamfer.
  { color: LOOK.ice, intensity: 7, position: [0, 6, 2], size: [6, 0.8] },
  // Low blue bounce so the underside is not dead black.
  { color: LOOK.blueBright, intensity: 3.2, position: [0, -6, 1], size: [8, 1.6] },
  // Big soft panel front-left-down (the rest pose leans left and slightly down): the flat face reflects its edge, so the face reads as a gradient rather than a void.
  { color: LOOK.blue, intensity: 2.6, position: [-4.6, -2.2, 3.8], size: [4.2, 7] },
  // Thin front-left fill, keeps the face readable.
  { color: LOOK.ice, intensity: 2.6, position: [-4, 0.5, 5], size: [0.5, 6] },
];
