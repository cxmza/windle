import { SCENE_BLUE } from '@windle/tokens';
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, type Texture, Vector2, Vector4 } from 'three';

/**
 * Nebula backdrop, adapted from apps/web (features/story/scene/nebula.ts; copied, not imported across apps).
 * Two passes: (1) analytic clouds — 4 gaussian blobs over a 2-octave value-noise warp — into a small render target,
 * luminance-capped so white text over the brightest cloud keeps >= 4.8:1; (2) a clip-space triangle at the far plane
 * that shows it upscaled with static grain. One mood here (no story chapters); `uShift` slides the clouds a little
 * against the camera orbit, so the backdrop reads as far away.
 */

const BLOBS = 4;

type Blob = readonly [number, number, number, number, number];

export const NEBULA_MOOD: readonly [Blob, Blob, Blob, Blob] = [
  [0.86, 0.1, 0.62, 1, 0.25],
  [0.12, 0.92, 0.44, 0.5, 0],
  [0.58, -0.06, 0.32, 0.55, 0.55],
  [0.02, 0.2, 0.3, 0.25, 0],
];

export const NEBULA = {
  maxLuminance: 0.17,
  resolution: { scale: 1 / 6, minPx: 64, maxPx: 320 },
  grain: 0.03,
  gain: 0.85,
  radiusScale: 0.68,
  warp: 0.34,
  detail: 0.55,
  drift: { orbit: 0.11, amp: 0.035, noise: 0.012 },
  parallax: 0.18,
} as const;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
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
uniform vec2 uShift;
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
  vec2 p = vec2((vUv.x + uShift.x) * uAspect, vUv.y + uShift.y);
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
    vec3 tint = mix(uDeep, uMid, smoothstep(0.0, 0.7, g));
    tint = mix(tint, uGlow, uCyan[i] * smoothstep(0.3, 1.0, g));
    col += tint * g * uGain;
  }
  float n = vnoise(q * 3.3 - vec2(tn * 0.7));
  col = uVoid + (col - uVoid) * ((1.0 - uDetail * 0.5) + uDetail * n);

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= min(1.0, uCap / max(lum, 1e-5));

  gl_FragColor = vec4(col, 1.0);
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
  gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) * uGrain;
}
`;

export function createNebulaBackdropMaterial(clouds: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { tClouds: { value: clouds }, uGrain: { value: NEBULA.grain } },
    vertexShader,
    fragmentShader: backdropFragmentShader,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
  });
}

export function createNebulaGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

export interface NebulaUniforms {
  [name: string]: { value: unknown };
  uTime: { value: number };
  uAspect: { value: number };
  uShift: { value: Vector2 };
}

export function createNebulaMaterial(): ShaderMaterial & { uniforms: NebulaUniforms } {
  const uniforms: NebulaUniforms = {
    uBlob: { value: NEBULA_MOOD.map((b) => new Vector4(b[0], b[1], b[2], b[3])) },
    uCyan: { value: NEBULA_MOOD.map((b) => b[4]) },
    uVoid: { value: new Color(SCENE_BLUE.voidNavy) },
    uDeep: { value: new Color(SCENE_BLUE.navyRaised) },
    uMid: { value: new Color(SCENE_BLUE.electric) },
    uGlow: { value: new Color(SCENE_BLUE.glow) },
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
    uShift: { value: new Vector2() },
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

export function cloudTargetSize(width: number, height: number): [number, number] {
  const { scale, minPx, maxPx } = NEBULA.resolution;
  const long = Math.max(width, height, 1);
  const s = Math.min(maxPx, Math.max(minPx, long * scale)) / long;
  return [Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s))];
}
