// Palette for code that cannot parse oklch() (three.js materials, canvas, GSAP colour tweens).
// Every value is the sRGB hex of the matching OKLCH token in ./tokens.css; palette.test.ts converts the CSS values
// and fails when they drift, so edit tokens.css first, then update the hex here.

/** Blue ramp, hue ~262: near-black navy -> electric blue -> cyan glow. Mirrors --blue-* in tokens.css. */
export const BLUE = {
  /** --blue-50 oklch(0.11 0.045 263) */
  50: '#000314',
  /** --blue-100 oklch(0.16 0.075 263) */
  100: '#00092d',
  /** --blue-200 oklch(0.22 0.11 263) */
  200: '#00124c',
  /** --blue-300 oklch(0.3 0.15 262) */
  300: '#002277',
  /** --blue-400 oklch(0.4 0.17 262) */
  400: '#093da1',
  /** --blue-500 oklch(0.55 0.2 260) */
  500: '#1c69e3',
  /** --blue-600 oklch(0.6 0.19 257) */
  600: '#237dee',
  /** --blue-700 oklch(0.72 0.15 245) */
  700: '#43acfb',
  /** --blue-800 oklch(0.82 0.11 225) */
  800: '#6cd3fa',
  /** --blue-900 oklch(0.92 0.05 215) */
  900: '#c0eefa',
} as const;

/** Neutral base (mirrors scene/scene-tokens.ts SCENE_COLOR, which stays the source for the monochrome scene). */
export const NEUTRAL = {
  black: '#000000',
  white: '#ffffff',
} as const;

/**
 * 3D-facing roles. Pick by role, not by step, so a re-tune of the ramp does not touch the scene.
 *   voidNavy      deepest navy: background bloom, shadow side of glass
 *   navy          --surface-navy: dark logo bodies, panels
 *   navyRaised    --surface-navy-raised
 *   electric      --accent: emissive base for interactive/active objects
 *   electricBright --border-accent: lit side of electric surfaces
 *   rim           light cyan edge on glass and extruded logos (--accent-text, 8.6:1 on black)
 *   glow          --glow: bloom / halo / emissive tint
 *   highlight     --blue-900: specular highlights on glass edges
 */
export const SCENE_BLUE = {
  voidNavy: BLUE[50],
  navy: BLUE[100],
  navyRaised: BLUE[200],
  electric: BLUE[500],
  electricBright: BLUE[600],
  rim: BLUE[700],
  glow: BLUE[800],
  highlight: BLUE[900],
} as const;

export type SceneBlueRole = keyof typeof SCENE_BLUE;

/** Extruded ecosystem logos (see hand/logo-sketch.ts for the sketch -> 3D handoff). */
export const LOGO_COLOR = {
  face: NEUTRAL.white,
  side: BLUE[300],
  emissive: BLUE[500],
  rim: SCENE_BLUE.rim,
} as const;

/** Role -> CSS custom property in tokens.css, for `getComputedStyle(root).getPropertyValue(...)` (returns oklch). */
export const PALETTE_CSS_VARS = {
  voidNavy: '--blue-50',
  navy: '--surface-navy',
  navyRaised: '--surface-navy-raised',
  electric: '--accent',
  electricBright: '--border-accent',
  rim: '--accent-text',
  glow: '--glow',
  highlight: '--blue-900',
} as const satisfies Record<SceneBlueRole, string>;
