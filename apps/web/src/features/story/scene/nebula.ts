import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, type Texture, Vector4 } from 'three';
import { NEBULA, NEBULA_MOODS, type NebulaMood, SCENE_COLOR } from './scene-tokens';

/**
 * Nebula backdrop (job: orientation — the light behind the glass shifts per chapter, so depth reads as progress).
 *
 * Two passes (Nebula.tsx):
 * 1. clouds — analytic and cheap: 4 gaussian blobs over a 2-octave value-noise warp (6 noise lookups, 4 exp, no fbm),
 *    rendered into a small render target (NEBULA.resolution of the canvas): the clouds are blurry by nature, and at
 *    full resolution this pass cost ~475 ms per frame on a software GL (SwiftShader, headless e2e) — measured.
 *    Its output is capped in WCAG relative luminance (NEBULA.maxLuminance): text contrast over the brightest cloud
 *    holds by construction.
 * 2. backdrop — a full-screen triangle written straight to clip space at the far plane: no camera, no placement,
 *    always behind every object, opaque, so the transmission pass renders it and the glass refracts it. It samples
 *    the clouds (bilinear upscale) and adds a static grain (NEBULA.grain) that also breaks 8-bit banding.
 */

const BLOBS = 4;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  // full-screen triangle from the 3 vertices of the geometry built in createNebulaGeometry (-1..3 clip space)
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec4 uBlob[${BLOBS}];
uniform float uCyan[${BLOBS}];
uniform vec3 uVoid;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uGlow;
uniform float uTime;
uniform float uAspect;
uniform float uGain;
uniform float uRadius;
uniform float uWarp;
uniform float uDetail;
uniform float uCap;
uniform float uOrbit;
uniform float uAmp;
uniform float uNoise;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  // aspect-correct space: x in viewport heights, so radii are circular on any screen
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float tn = uTime * uNoise;
  vec2 w = vec2(vnoise(p * 1.6 + vec2(tn, 0.0)), vnoise(p * 1.6 + vec2(5.2, 1.3) - vec2(0.0, tn)));
  vec2 q = p + (w - 0.5) * uWarp;

  vec3 col = uVoid;
  for (int i = 0; i < ${BLOBS}; i++) {
    vec4 b = uBlob[i];
    float fi = float(i);
    vec2 orbit = vec2(sin(uTime * uOrbit * (1.0 + 0.23 * fi) + fi * 1.7), cos(uTime * uOrbit * (0.8 + 0.19 * fi) + fi * 2.9));
    vec2 c = vec2(b.x * uAspect, b.y) + orbit * uAmp;
    vec2 d = q - c;
    float r = b.z * uRadius;
    float g = exp(-dot(d, d) / max(r * r, 1e-4)) * b.w;
    // density ramps deep navy -> electric; the cyan share rides on the dense core only
    vec3 tint = mix(uDeep, uMid, smoothstep(0.0, 0.7, g));
    tint = mix(tint, uGlow, uCyan[i] * smoothstep(0.3, 1.0, g));
    col += tint * g * uGain;
  }
  // filaments: a second, finer octave modulates density (not the void floor)
  float n = vnoise(q * 3.3 - vec2(tn * 0.7));
  col = uVoid + (col - uVoid) * ((1.0 - uDetail * 0.5) + uDetail * n);

  // contrast guarantee: cap relative luminance (linear sRGB, Rec.709 weights = WCAG)
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= min(1.0, uCap / max(lum, 1e-5));

  gl_FragColor = vec4(col, 1.0);
  // the render target is sRGB: stored encoded (no extra 8-bit banding in the darks), decoded on sampling
  #include <colorspace_fragment>
}
`;

const backdropFragmentShader = /* glsl */ `
uniform sampler2D tClouds;
uniform float uGrain;
varying vec2 vUv;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  gl_FragColor = vec4(texture2D(tClouds, vUv).rgb, 1.0);
  #include <colorspace_fragment>
  // static film grain (was a CSS overlay with mix-blend-mode over the whole canvas)
  gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) * uGrain;
}
`;

/** Pass 2: the clip-space backdrop that shows the cloud render target (see the module comment). */
export function createNebulaBackdropMaterial(clouds: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { tClouds: { value: clouds }, uGrain: { value: NEBULA.grain } },
    vertexShader,
    fragmentShader: backdropFragmentShader,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

/** One triangle covering clip space (-1..3): cheaper than a quad (no diagonal seam, one primitive). */
export function createNebulaGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

export interface NebulaUniforms {
  [name: string]: { value: unknown };
  uBlob: { value: Vector4[] };
  uCyan: { value: number[] };
  uTime: { value: number };
  uAspect: { value: number };
}

const linear = (hex: string) => new Color(hex);

/** Pass 1: the clouds, rendered into the small target. */
export function createNebulaMaterial(): ShaderMaterial & { uniforms: NebulaUniforms } {
  const uniforms: NebulaUniforms = {
    uBlob: { value: Array.from({ length: BLOBS }, () => new Vector4()) },
    uCyan: { value: Array.from({ length: BLOBS }, () => 0) },
    uVoid: { value: linear(SCENE_COLOR.voidNavy) },
    uDeep: { value: linear(SCENE_COLOR.navyRaised) },
    uMid: { value: linear(SCENE_COLOR.electric) },
    uGlow: { value: linear(SCENE_COLOR.glow) },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uGain: { value: NEBULA.gain },
    uRadius: { value: NEBULA.radiusScale },
    uWarp: { value: NEBULA.warp },
    uDetail: { value: NEBULA.detail },
    uCap: { value: NEBULA.maxLuminance },
    uOrbit: { value: NEBULA.drift.orbit },
    uAmp: { value: NEBULA.drift.amp },
    uNoise: { value: NEBULA.drift.noise },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  return material as ShaderMaterial & { uniforms: NebulaUniforms };
}

/** Mutable mood state: 4 blobs x [x, y, radius, intensity, cyan]. */
export type MoodState = number[][];

export function moodState(chapter = 0): MoodState {
  const m = NEBULA_MOODS[Math.max(0, Math.min(NEBULA_MOODS.length - 1, chapter))] ?? NEBULA_MOODS[0];
  return (m as NebulaMood).map((b) => [...b]);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Pure: target mood at a continuous story position (chapter + transition progress), written into `out`.
 * The handoff is eased (smoothstep), so the light settles while the next chapter's stage is arriving.
 */
export function moodAt(chapter: number, transition: number, out: MoodState): MoodState {
  const last = NEBULA_MOODS.length - 1;
  const a = NEBULA_MOODS[Math.max(0, Math.min(last, chapter))];
  const b = NEBULA_MOODS[Math.max(0, Math.min(last, chapter + 1))];
  const t = smooth(Math.max(0, Math.min(1, transition)));
  if (!a || !b) return out;
  for (let i = 0; i < BLOBS; i++) {
    const ba = a[i];
    const bb = b[i];
    const o = out[i];
    if (!ba || !bb || !o) continue;
    for (let k = 0; k < 5; k++) o[k] = (ba[k] ?? 0) * (1 - t) + (bb[k] ?? 0) * t;
  }
  return out;
}

/** Follow `target` with factor k (0..1) and upload to the uniforms. */
export function applyMood(current: MoodState, target: MoodState, k: number, u: NebulaUniforms) {
  for (let i = 0; i < BLOBS; i++) {
    const c = current[i];
    const t = target[i];
    const v = u.uBlob.value[i];
    if (!c || !t || !v) continue;
    for (let j = 0; j < 5; j++) c[j] = (c[j] ?? 0) + ((t[j] ?? 0) - (c[j] ?? 0)) * k;
    v.set(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
    u.uCyan.value[i] = c[4] ?? 0;
  }
}
