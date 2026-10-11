import { LOGO_COLOR, NEUTRAL, SCENE_BLUE } from '@windle/tokens';

// 3D tokens. three.js cannot parse oklch(), so colours come from @windle/tokens palette.ts (sRGB mirrors of tokens.css,
// guarded by palette.test.ts). Pick colours by role here; never hard-code a hex in a component.
export const SCENE_COLOR = {
  ink: SCENE_BLUE.navy,
  /** Lacquered slab body: near-black navy. */
  slab: SCENE_BLUE.navy,
  /** Brushed chrome base: cool white so the blue studio colours it. */
  chrome: SCENE_BLUE.highlight,
  /** Glass tint. */
  glass: NEUTRAL.white,
  /** SHIP glow (emissive + light bar). */
  light: NEUTRAL.white,
  /** Rim lights and edge ink. */
  rim: SCENE_BLUE.rim,
  glow: SCENE_BLUE.glow,
  electric: SCENE_BLUE.electric,
  electricBright: SCENE_BLUE.electricBright,
  highlight: SCENE_BLUE.highlight,
  navy: SCENE_BLUE.navy,
  navyRaised: SCENE_BLUE.navyRaised,
  voidNavy: SCENE_BLUE.voidNavy,
  black: NEUTRAL.black,
} as const;

/**
 * Hero mark glass (high tier). The mark sits in a measured slot clear of the title (mark-slots.ts), so it no longer
 * has to stay dark: a clear, lightly absorbing body that bends the nebula behind it, a crisp clearcoat that catches
 * the studio's top strip, and an electric-cyan edge glow along the bevels and silhouette.
 */
export const HERO_GLASS = {
  tint: SCENE_BLUE.highlight,
  attenuation: SCENE_BLUE.electric,
  attenuationDistance: 1.1,
  envMapIntensity: 1.9,
  thickness: 1.2,
  roughness: 0.04,
  clearcoatRoughness: 0.02,
  /** Silhouette ink and edge glow: the light the glass edges catch. */
  rimInk: SCENE_BLUE.glow,
  rimGlow: 0.9,
  /** Hatching on the large front faces (bevels and sides keep it). */
  faceHatch: 0.1,
} as const;

/**
 * Hero mark, low tier (narrow screens always; wide after the quality governor's last step): electric-blue metal
 * instead of cool-white chrome, so every studio reflection comes back tinted blue; a thin clearcoat adds the white
 * specular line the glass gets from its coat.
 */
export const HERO_CHROME = {
  tint: SCENE_BLUE.electric,
  envMapIntensity: 2.2,
  clearcoat: 0.6,
} as const;

/** Logo materials (palette roles from LOGO_COLOR). */
export const LOGO_TINT = LOGO_COLOR;

/**
 * Engraving (see engrave.ts): object-space line hatching whose width follows the lit tone, cross-hatch in shadows,
 * white/cyan ink on silhouettes. Values are uniforms, so all engraved materials share one program.
 */
export const ENGRAVE = {
  /** Lines per object-space unit, per object family. */
  freq: { hero: 22, cube: 26, slab: 18, ring: 30, logo: 16 },
  /** Hatch strength 0..1 (dark ink cut into lit metal; white ink scratched out of deep shadow). */
  strength: { glass: 0.5, chrome: 0.7, slab: 0.9, logoFace: 0, logoSide: 0.9 },
  /** Silhouette ink line + soft cyan edge glow. */
  rim: { line: 0.8, glow: 0.3 },
  /** What transmissive glass shows where nothing opaque is behind it (fallback; the nebula normally fills it). */
  behind: SCENE_BLUE.navy,
  /** How bright the white-ink hatching in deep shadow gets (linear, before tone mapping). */
  inkLift: 0.07,
} as const;

/**
 * Adaptive quality (quality.ts). Only sustained low frame rate steps quality down; oscillation alone never does.
 * Steps: DPR max -> mid -> min -> low tier (no transmission). Never steps back up (each step costs a resize or a
 * shader recompile; flip-flopping is what made drei's PerformanceMonitor drop healthy GPUs).
 */
/**
 * `narrowMax`: cap in mobile mode (narrow or coarse pointer). DPR 1 vs 1.75 did not change main-thread cost
 * (mobile-4x, desktop GPU); a real phone GPU is unmeasured and fill-rate bound, so phones (DPR 2-3) render at 1.25:
 * the engraved objects are the only sharp detail and the nebula is soft by design.
 */
export const DPR = { min: 1, mid: 1.35, max: 1.75, narrowMax: 1.25 } as const;

export const QUALITY = {
  /** Sample window, seconds. */
  window: 1,
  /** Windows ignored after start and after every step (resize / recompile settle). */
  settle: 2,
  /** A window is "slow" when its mean fps is below this fraction of the estimated refresh rate... */
  slowRatio: 0.72,
  /** ...and below this absolute fps (so a 144 Hz screen at 100 fps is not "slow"). */
  slowFps: 48,
  /** Consecutive slow windows before one step down. */
  sustain: 3,
  /** Frame deltas above this (s) are hitches (tab switch, GC, compile), not throughput: excluded. */
  hitch: 0.25,
} as const;

/** Exponential damping rate (1/s) when following scroll targets. Higher = tighter. */
export const FOLLOW_RATE = 6;

/** Pointer parallax amplitude in world units (camera offset). */
export const PARALLAX = { x: 0.25, y: 0.15 } as const;

/**
 * The windle mark (the "notch" logo: rounded square, three wedges cut so a W reads in negative space), extruded.
 * Geometry is built at `size` world units; poses scale it. `sway`: idle yaw (a flat mark must keep facing the viewer,
 * so it sways instead of spinning). Quality tiers pick the arc/bevel resolution.
 */
export const MARK = {
  size: 1.6,
  /** Extrusion depth (before bevel), world units at scale 1. */
  depth: 0.34,
  /** Soft bevel; applied inwards (bevelOffset = -size) so the silhouette stays exactly the approved outline. */
  bevel: { thickness: 0.1, size: 0.085 },
  segments: { high: { arc: 12, bevel: 5 }, low: { arc: 6, bevel: 3 } },
  /** Normals are smoothed across edges flatter than this (rad): arcs and bevels read round, notch corners stay crisp. */
  creaseAngle: Math.PI / 6,
  sway: { amp: 0.14, speed: 0.45 },
} as const;

/**
 * Jelly (jelly.ts). `classic`: the approved "Классика" keyframes (squash 20% -> stretch 16% + skew -> settle), active
 * span ~1.25 s, pivot at the mark's bottom edge. Amplitudes per trigger: landing / tap = 1, hero re-entry is subtle.
 * `drag`: the approved "Перетяни" 2D spring (k 220, c 7, unit mass): follows half the pointer travel, clamped, and
 * stretches along the drag direction. Lengths are in mark sizes (the 120-unit reference box = 1).
 */
export const JELLY = {
  classic: {
    duration: 1.25,
    /** [time 0..1, scaleX, scaleY, skewX deg (CSS sign: negative leans the top right in y-down)] */
    keys: [
      [0, 1, 1, 0],
      [8 / 48, 1.2, 0.8, 0],
      [18 / 48, 0.86, 1.16, -4],
      [28 / 48, 1.08, 0.93, 3],
      [38 / 48, 0.97, 1.04, 0],
      [1, 1, 1, 0],
    ] as ReadonlyArray<readonly [number, number, number, number]>,
  },
  amp: { land: 1, tap: 1, reenter: 0.45, cta: 0.7 },
  /** The landing jelly fires when the intro tween (0..1, decelerate) passes this point: the mark has visually arrived. */
  landAt: 0.93,
  drag: {
    stiffness: 220,
    damping: 7,
    /** The mark follows this fraction of the pointer travel. */
    follow: 0.5,
    /** Max offset, mark sizes (38 / 120 in the reference). */
    maxOffset: 38 / 120,
    /** Stretch per mark size of offset (1 / (70 / 120)) and its cap. */
    stretchPerSize: 120 / 70,
    maxStretch: 0.45,
    /** Cross-axis thinning per unit stretch. */
    thin: 0.55,
    /** At rest when offset and velocity fall under these (mark sizes, mark sizes/s). */
    restOffset: 4e-4,
    restVelocity: 4e-3,
  },
  // press/drag/scroll disambiguation: DRAG_GESTURE (lib/motion-tokens), shared with the 2D marks
  /** The mark only takes pointer input above this pose scale (hidden / mid-handoff marks are not grabbable). */
  minScale: 0.4,
} as const;

/** How far the hero mark travels in from (world units, -z) on load. */
export const INTRO_DEPTH = 14;

export const SHARDS = { high: 44, low: 16 } as const;

export const FOV = { wide: 35, narrow: 50 } as const;

/**
 * Narrow layout: objects centred and lifted above the text block.
 * `outcome`: where the split cube sits beyond the portal. On narrow screens the SHIP/SLASH columns stack
 * full-width, so the cube shrinks into the gap between the SHIP verdict and the SLASH column.
 */
/**
 * Narrow fit (poses.ts fitFor): a chapter's objects scale as one composition into the measured text-free band.
 * `width`: share of the viewport width the composition may span. `maxScale`: never larger than the designed pose.
 * `minScale`: below this the objects would read as specks next to the text, so they are not shown at all.
 */
export const NARROW_FIT = { width: 0.86, maxScale: 1, minScale: 0.42 } as const;

export const LAYOUT = {
  wide: { side: 1.9, lift: 0, outcome: { y: 0, scale: 1.25 } },
  // narrow hero: the title fills the width, so the mark sits under it (behind the opaque subtitle box and buttons) with
  // its top edge below the title's last line — any edge crossing the letters failed 3:1 (scratchpad contrast.mjs).
  narrow: { side: 0, lift: 0.9, outcome: { y: 0, scale: 0.72 }, mark: { y: -0.68, scale: 1.26 } },
} as const;

/** SHIP half glow: capped emissive so transmission/reflections still read, plus a light bar behind it. */
export const GLOW = { emissive: 0.2, bar: 1 } as const;

/**
 * Nebula (nebula.ts): soft light clouds in deep black behind every object, rendered in the scene so transmission
 * glass refracts it. One mood per chapter (CHAPTERS order); the scene lerps between neighbours on scroll.
 * Blob: [x, y (0..1 of the viewport, y up), radius (viewport heights), intensity, cyan 0..1 (deep blue -> glow)].
 * Blobs keep their index across moods, so a chapter change slides the same clouds rather than swapping them.
 * Lights sit opposite the text column (SIDE_BY_ID in Story.tsx); centred chapters keep light low and to the sides.
 */
export type NebulaBlob = readonly [number, number, number, number, number];
export type NebulaMood = readonly [NebulaBlob, NebulaBlob, NebulaBlob, NebulaBlob];

export const NEBULA_MOODS: ReadonlyArray<NebulaMood> = [
  // hero: VK-style wash from the lower right, a dim counter-glow top left
  [
    [0.84, 0.12, 0.6, 1, 0.25],
    [0.14, 0.9, 0.42, 0.45, 0],
    [0.6, -0.04, 0.3, 0.6, 0.6],
    [0.02, 0.18, 0.3, 0.25, 0],
  ],
  // promise (text left)
  [
    [0.86, 0.5, 0.55, 0.95, 0.3],
    [0.62, 0.95, 0.36, 0.4, 0],
    [0.98, 0.08, 0.3, 0.6, 0.5],
    [0.08, 0.06, 0.3, 0.2, 0],
  ],
  // collateral (text right)
  [
    [0.14, 0.5, 0.55, 0.95, 0.3],
    [0.38, 0.95, 0.36, 0.4, 0],
    [0.02, 0.08, 0.3, 0.6, 0.5],
    [0.92, 0.06, 0.3, 0.2, 0],
  ],
  // market (text left)
  [
    [0.82, 0.3, 0.55, 1, 0.4],
    [0.56, 0.9, 0.36, 0.5, 0.1],
    [1.02, 0.72, 0.3, 0.5, 0.6],
    [0.1, 0.02, 0.3, 0.2, 0],
  ],
  // incentive (text right)
  [
    [0.18, 0.3, 0.55, 1, 0.4],
    [0.44, 0.9, 0.36, 0.5, 0.1],
    [-0.02, 0.72, 0.3, 0.5, 0.6],
    [0.9, 0.02, 0.3, 0.2, 0],
  ],
  // judge (text left): calmer, deeper
  [
    [0.86, 0.66, 0.52, 0.8, 0.15],
    [0.72, 0.08, 0.42, 0.6, 0.5],
    [0.32, 0.98, 0.3, 0.3, 0],
    [0.04, 0.3, 0.3, 0.15, 0],
  ],
  // outcome (centred split): SHIP light left, SLASH side colder and dimmer
  [
    [0.14, 0.3, 0.42, 0.75, 0.6],
    [0.86, 0.3, 0.42, 0.6, 0.05],
    [0.5, 1, 0.36, 0.35, 0],
    [0.5, -0.04, 0.3, 0.4, 0.3],
  ],
  // ecosystem: light rising from below the logo grid
  [
    [0.5, 0.02, 0.55, 0.85, 0.3],
    [0.1, 0.84, 0.36, 0.4, 0],
    [0.9, 0.84, 0.36, 0.45, 0.2],
    [0.5, 0.5, 0.26, 0.15, 0],
  ],
  // cta (centred): the hero wash returns, mirrored in
  [
    [0.84, 0.12, 0.58, 1, 0.35],
    [0.16, 0.12, 0.5, 0.8, 0.2],
    [0.5, 1, 0.36, 0.3, 0],
    [0.5, -0.06, 0.3, 0.5, 0.6],
  ],
];

/**
 * Nebula look. `maxLuminance` caps the WCAG relative luminance of every nebula pixel (linear sRGB, before output
 * encoding): white text keeps >= (1.05 / (cap + 0.05)) = 4.8:1 over the brightest cloud. `drift`: idle motion
 * (rad/s for the blob orbit, world-free uv amplitude; noise scroll per second) — zero under reduced motion.
 * `warp`: how far the low-frequency noise pushes the clouds (uv), which turns round blobs into cloud shapes.
 */
export const NEBULA = {
  maxLuminance: 0.17,
  /** Cloud render target size as a fraction of the canvas CSS size (clamped to [minPx, maxPx] on the long side). */
  resolution: { scale: 1 / 6, minPx: 64, maxPx: 320 },
  /** Static grain amplitude (output-encoded units): the old CSS film grain, now free inside the nebula pass. */
  grain: 0.03,
  /** Linear multiplier of the mid (electric) colour at a blob's core, before the cap. */
  gain: 0.85,
  /** Global radius multiplier over NEBULA_MOODS (one knob for "how much of the screen is black"). */
  radiusScale: 0.68,
  warp: 0.34,
  /** Filament contrast: density *= (1 - detail/2) + detail * noise. */
  detail: 0.55,
  drift: { orbit: 0.11, amp: 0.035, noise: 0.012 },
  /** Exponential follow rate (1/s) of the mood when the chapter changes (slower than objects: light lags). */
  followRate: 2.5,
} as const;

/**
 * Studio environment (studio-env.ts): a navy-to-black gradient dome plus emissive "light former" planes, baked once
 * into a PMREM cube map. Intensity multiplies the colour (unclamped, not tone mapped) so chrome gets HDR-ish highlights.
 * [x, y, z, width, height, colour role, intensity]
 */
export const STUDIO_FORMERS: ReadonlyArray<
  readonly [number, number, number, number, number, 'highlight' | 'rim' | 'electric' | 'glow', number]
> = [
  // narrow cool-white top strip: one glossy highlight line on glass and chrome (not a whole bright face)
  [0, 5, -2, 10, 1.4, 'highlight', 2.6],
  // electric-blue rim strips behind both sides (the VK Cloud edge light)
  [-6, 0.5, -1, 2, 9, 'electric', 3.5],
  [6, -0.5, -2, 2.4, 9, 'rim', 3],
  // low bounce from the lower right (where the CSS bloom sits)
  [4, -4, 3, 6, 2, 'electric', 2],
  // small cyan kicker in front: catches bevels and logo faces
  [-2, 1.5, 7, 1.6, 1.6, 'glow', 1.2],
];

/** Directional rim lights: [x, y, z, intensity, colour role]. */
export const RIM_LIGHTS: ReadonlyArray<readonly [number, number, number, number, 'rim' | 'electricBright' | 'glow']> = [
  [-4, 3, -3, 2.4, 'rim'],
  [4, -1, -4, 1.8, 'electricBright'],
  // soft front key: logo faces and bevels need something to catch
  [2, 4, 5, 0.9, 'glow'],
];

/** Ecosystem logos (Logos.tsx). */
export const LOGO = {
  /** Distance in front of the camera (view-space depth) where logos sit over their DOM slots. */
  depth: 3.4,
  /** Fraction of the slot square the logo fills. */
  fill: 0.78,
  /** Extrusion depth relative to the logo's unit size. */
  extrude: 0.2,
  /** Spring for extrude 0 -> 1: underdamped for a brand "settle" (≈ Motion bounce 0.3, visualDuration 0.7 s). */
  spring: { stiffness: 140, damping: 11 },
  /** Idle sway amplitude (rad) and speed (rad/s). */
  sway: { amp: 0.22, speed: 0.55 },
  /** Pointer tilt amplitude (rad). */
  tilt: 0.3,
  /** Resting 3/4 view (rad) so the extruded, engraved sides read; reduced motion keeps it too (static). */
  rest: { x: -0.22, y: 0.38 },
  /** The 3D logo takes over (markLogoExtruded) once the extrusion passes this fraction: sketch and logo overlap. */
  handoff: 0.3,
} as const;
