import { Color, type MeshPhysicalMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { ENGRAVE } from './scene-tokens';

/**
 * Engraving look for MeshPhysicalMaterial (onBeforeCompile patch, no extra pass).
 *
 * - Object-space line hatching: the lines are "cut" into the object and move with it (screen-space hatching would
 *   swim when the camera travels). Line WIDTH follows the lit tone of the fragment (luminance of the final
 *   physical-lighting result), a second direction joins in shadows (cross-hatch).
 * - Midtones: dark ink cut into the lit glass/chrome, so reflections stay premium and the form reads as an etching.
 *   Deep shadow: white ink scratched out of the black (scratchboard), so dark faces stay legible on a dark page.
 * - Silhouettes/bevels: a crisp ink line (fwidth-sized) where the surface turns away from the camera, plus a soft
 *   cyan edge glow (the VK-Cloud glass edge).
 * - Lines fade out when their period falls under ~3 px (no moiré on small/far objects).
 *
 * All engraved materials share ONE program (same cache key); per-material values are uniforms.
 */

export interface EngraveOptions {
  /** Lines per object-space unit. */
  freq: number;
  /** Hatch strength 0..1. */
  strength: number;
  /** Colour of the white ink (deep-shadow hatching). */
  ink: string;
  /** Colour of the silhouette ink and edge glow. */
  rimInk: string;
  rimLine?: number;
  rimGlow?: number;
  /**
   * Hatch multiplier on faces turned to the camera (1 = uniform hatching). Below 1 the large flat faces stay clean
   * glass and the engraving lives on bevels, sides and silhouettes.
   */
  faceHatch?: number;
}

interface EngraveUniforms {
  uEngraveFreq: { value: number };
  uEngrave: { value: number };
  uInk: { value: Color };
  uInkLift: { value: number };
  uRimInk: { value: Color };
  uRimLine: { value: number };
  uRimGlow: { value: number };
  uBehind: { value: Color };
  uFaceHatch: { value: number };
}

const CACHE_KEY = 'engrave-v2';

const VERT_DECL = /* glsl */ `
varying vec3 vEngravePos;
`;

const VERT_BODY = /* glsl */ `
vEngravePos = transformed;
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vEngravePos;
uniform float uEngraveFreq;
uniform float uEngrave;
uniform vec3 uInk;
uniform float uInkLift;
uniform vec3 uRimInk;
uniform float uRimLine;
uniform float uRimGlow;
uniform vec3 uBehind;
uniform float uFaceHatch;

// 1 on a line of half-width w (in line periods), 0 between lines; anti-aliased; fades out when lines get sub-pixel.
float engraveLine(float coord, float w) {
  float d = abs(fract(coord) - 0.5);
  float aa = fwidth(coord);
  float line = (1.0 - smoothstep(w - aa, w + aa, 0.5 - d)) * smoothstep(0.0, 0.04, w);
  return line * (1.0 - smoothstep(0.22, 0.4, aa));
}
`;

const FRAG_BODY = /* glsl */ `
{
  vec3 p = vEngravePos * uEngraveFreq;
  // a slight hand wobble so the hatching reads as engraved, not printed
  float wob = 0.15 * sin(dot(vEngravePos, vec3(3.1, 2.3, 1.7)) * 2.0);
  float c1 = dot(p, vec3(0.83, 0.5, 0.25)) + wob;
  float c2 = dot(p, vec3(-0.45, 0.85, 0.3)) - wob;
#ifdef USE_TRANSMISSION
  // The canvas clears transparent (the CSS navy bloom is behind it), so transmitted alpha is 0 wherever nothing
  // opaque is behind the glass: it would composite see-through and milky. Stand in a navy "behind", stay opaque.
  outgoingLight += uBehind * (1.0 - material.transmissionAlpha) * material.transmission;
  material.transmissionAlpha = 1.0;
#endif
  float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
  // faces turned to the camera keep uFaceHatch of the hatching; bevels and sides keep all of it
  float hatchK = mix(1.0, uFaceHatch, smoothstep(0.7, 0.88, ndv));
  float tone = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  float shade = 1.0 - smoothstep(0.015, 0.4, tone);
  // dark ink: single hatch in midtones, cross-hatch in shadow. Thin lines (<= 34% / 26% of the period): wider ones
  // leave dot-shaped gaps that read as halftone, not engraving.
  float h1 = engraveLine(c1, 0.17 * smoothstep(0.15, 0.7, shade));
  float h2 = engraveLine(c2, 0.13 * smoothstep(0.55, 0.9, shade));
  float deep = smoothstep(0.88, 1.0, shade);
  float darkInk = max(h1, h2) * uEngrave * hatchK * (1.0 - deep);
  outgoingLight *= 1.0 - darkInk * 0.85;
  // white ink: where the surface is already black, sparse fine scratches (one direction) keep the form legible
  outgoingLight += uInk * engraveLine(c1, 0.06) * deep * uEngrave * hatchK * uInkLift;
  float fw = fwidth(ndv);
  float rimLine = 1.0 - smoothstep(0.1 - fw, 0.1 + fw, ndv);
  float rimGlow = pow(1.0 - ndv, 5.0);
  outgoingLight += uRimInk * (rimLine * uRimLine + rimGlow * uRimGlow);
}
`;

export function applyEngraving(material: MeshPhysicalMaterial, opts: EngraveOptions): MeshPhysicalMaterial {
  const uniforms: EngraveUniforms = {
    uEngraveFreq: { value: opts.freq },
    uEngrave: { value: opts.strength },
    uInk: { value: new Color(opts.ink) },
    uInkLift: { value: ENGRAVE.inkLift },
    uRimInk: { value: new Color(opts.rimInk) },
    uRimLine: { value: opts.rimLine ?? ENGRAVE.rim.line },
    uRimGlow: { value: opts.rimGlow ?? ENGRAVE.rim.glow },
    uBehind: { value: new Color(ENGRAVE.behind) },
    uFaceHatch: { value: opts.faceHatch ?? 1 },
  };
  material.userData.engrave = uniforms;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <opaque_fragment>', `${FRAG_BODY}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => CACHE_KEY;
  return material;
}
