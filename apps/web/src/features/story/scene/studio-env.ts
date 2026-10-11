import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  DoubleSide,
  type Material,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { SCENE_COLOR, STUDIO_FORMERS } from './scene-tokens';

/** Gradient stops of the dome by height (−1 bottom .. 1 top): navy bloom low, black overhead. */
const DOME_STOPS: ReadonlyArray<readonly [number, string]> = [
  [-1, SCENE_COLOR.navyRaised],
  [-0.4, SCENE_COLOR.navy],
  [0.2, SCENE_COLOR.voidNavy],
  [1, SCENE_COLOR.black],
];

function domeColor(y: number, out: Color, a: Color, b: Color) {
  for (let i = 0; i < DOME_STOPS.length - 1; i++) {
    const s0 = DOME_STOPS[i];
    const s1 = DOME_STOPS[i + 1];
    if (!s0 || !s1) continue;
    if (y <= s1[0] || i === DOME_STOPS.length - 2) {
      const t = Math.min(1, Math.max(0, (y - s0[0]) / (s1[0] - s0[0])));
      return out.copy(a.set(s0[1])).lerp(b.set(s1[1]), t);
    }
  }
  return out;
}

/** Env map resolution (cube face px). The top highlight strip must stay a crisp line on the glass. */
const ENV_SIZE = 256;
const ENV_GGX_SAMPLES = 32;

/**
 * PMREMGenerator internals used to precompile its filter shaders off the main thread (three r186; checked at runtime,
 * so a three upgrade that renames them only loses the precompile, never the env map).
 */
interface PmremInternals {
  _setSize?: (size: number) => void;
  _allocateTargets?: () => WebGLRenderTarget;
  _blurMaterial?: Material | null;
  _ggxMaterial?: Material | null;
}

/**
 * Compiles the PMREM blur + GGX filter programs with KHR_parallel_shader_compile (renderer.compileAsync polls instead
 * of blocking). Measured before (cold GPU cache, RTX 3080 / D3D11): the GGX program linked synchronously on its first
 * use inside fromScene — one 1.0-1.1 s main-thread freeze right after first paint (getProgramParameter in
 * WebGLUniforms). fromScene then reuses the same materials (same size => _allocateTargets keeps them).
 */
async function precompilePmrem(gl: WebGLRenderer, pmrem: PMREMGenerator, size: number): Promise<void> {
  const p = pmrem as unknown as PmremInternals;
  if (typeof p._setSize !== 'function' || typeof p._allocateTargets !== 'function') return;
  p._setSize(size);
  // the filter passes render into this (half-float) target: compiling against it gives the same program key
  const target = p._allocateTargets();
  // GGX importance samples per texel: three's 256 unroll into a shader D3D (ANGLE/FXC) compiles for ~1 s in the GPU
  // process, and the next sync GL query waits for it. The studio is a few soft gradients and planes, so a much
  // smaller sample count filters it without visible noise (compared in screenshots, scratchpad nebula-*).
  const ggx = p._ggxMaterial as (Material & { defines?: Record<string, unknown> }) | null | undefined;
  if (ggx?.defines && 'GGX_SAMPLES' in ggx.defines) {
    ggx.defines.GGX_SAMPLES = ENV_GGX_SAMPLES;
    ggx.needsUpdate = true;
  }
  const mats = [p._blurMaterial, p._ggxMaterial].filter((m): m is Material => m != null);
  if (mats.length === 0) return;
  const warm = new Scene();
  const geo = new BufferGeometry();
  for (const m of mats) warm.add(new Mesh(geo, m));
  const cam: Camera = new OrthographicCamera();
  const prev = gl.getRenderTarget();
  let pending: Promise<unknown>;
  try {
    gl.setRenderTarget(target);
    pending = gl.compileAsync(warm, cam);
  } finally {
    gl.setRenderTarget(prev);
  }
  try {
    await pending;
  } finally {
    geo.dispose();
    target.dispose();
  }
}

/**
 * Navy studio baked once into a PMREM env map: a vertex-coloured gradient dome plus emissive "light former" planes
 * (cool-white top box, electric-blue rim strips, cyan kicker). Replaces drei <Environment>, which pulled the
 * EXR/RGBE/gainmap loaders into the 3D chunk although only light formers were used.
 * Async: the filter shaders compile in parallel first (precompilePmrem), then the bake itself is a few draw calls.
 * Resolves with the render target (the caller owns it: dispose on unmount), or null when cancelled meanwhile.
 */
export async function bakeStudioEnv(gl: WebGLRenderer, isCancelled: () => boolean): Promise<WebGLRenderTarget | null> {
  const pmrem = new PMREMGenerator(gl);
  try {
    await precompilePmrem(gl, pmrem, ENV_SIZE);
  } catch {
    // compile errors surface in fromScene; never block the env on the precompile
  }
  if (isCancelled()) {
    pmrem.dispose();
    return null;
  }
  const scene = new Scene();
  const dome = new SphereGeometry(20, 32, 16);
  const pos = dome.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  const ca = new Color();
  const cb = new Color();
  for (let i = 0; i < pos.count; i++) {
    domeColor(pos.getY(i) / 20, c, ca, cb);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new BufferAttribute(colors, 3));
  const domeMat = new MeshBasicMaterial({ vertexColors: true, side: BackSide, toneMapped: false });
  scene.add(new Mesh(dome, domeMat));

  const plane = new PlaneGeometry(1, 1);
  const formerMats: MeshBasicMaterial[] = [];
  for (const [x, y, z, w, h, role, intensity] of STUDIO_FORMERS) {
    const mat = new MeshBasicMaterial({
      color: new Color(SCENE_COLOR[role]).multiplyScalar(intensity),
      side: DoubleSide,
      toneMapped: false,
    });
    formerMats.push(mat);
    const m = new Mesh(plane, mat);
    m.position.set(x, y, z);
    m.scale.set(w, h, 1);
    m.lookAt(0, 0, 0);
    scene.add(m);
  }

  const target = pmrem.fromScene(scene, 0, 0.1, 100, { size: ENV_SIZE });
  pmrem.dispose();
  dome.dispose();
  domeMat.dispose();
  plane.dispose();
  for (const m of formerMats) m.dispose();
  return target;
}
