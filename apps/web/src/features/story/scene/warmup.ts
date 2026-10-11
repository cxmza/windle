import {
  type Camera,
  HalfFloatType,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/**
 * Staged shader precompile (perf/opportunities.md #2: a 3.9-5 s first-render freeze and 240-440 ms scroll hitches
 * when materials compiled lazily, synchronously, the first time they became visible).
 *
 * Every mesh in the scene is compiled through `renderer.compileAsync` (KHR_parallel_shader_compile: the GPU process
 * compiles while the main thread polls), one program group per idle slot, so no single long task. Objects are forced
 * visible only for the synchronous part of the call. Opaque meshes are compiled a second time with a render target
 * bound, because the transmission pass renders them off-screen with different program parameters (no tone mapping,
 * linear output) — without that the first transmissive frame would still link programs synchronously.
 * Objects flagged `userData.warmFirst` (what the hero shows) go first; `onFirstStage` then lets the loop start.
 */

function isMesh(o: Object3D): o is Mesh {
  return (o as Partial<Mesh>).isMesh === true;
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function isTransmissive(m: Material): boolean {
  return 'transmission' in m && typeof m.transmission === 'number' && m.transmission > 0;
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 120 });
    else setTimeout(resolve, 16);
  });
}

export interface WarmupOptions {
  /** Also compile the off-screen (transmission pass) variants of opaque meshes. */
  transmission: boolean;
  isCancelled: () => boolean;
  onFirstStage: () => void;
}

export async function precompileScene(gl: WebGLRenderer, scene: Scene, camera: Camera, opts: WarmupOptions) {
  const seen = new Set<string>();
  const first: Mesh[] = [];
  const rest: Mesh[] = [];
  scene.traverse((o) => {
    if (!isMesh(o)) return;
    const mats = materialsOf(o);
    const key = `${(o as Partial<{ isInstancedMesh: boolean }>).isInstancedMesh ? 'i' : 'm'}:${mats.map((m) => m.uuid).join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    (o.userData.warmFirst === true ? first : rest).push(o);
  });

  const offscreen = opts.transmission ? new WebGLRenderTarget(1, 1, { type: HalfFloatType }) : null;
  const compile = async (mesh: Mesh, target: WebGLRenderTarget | null) => {
    const wasVisible = mesh.visible;
    const prevTarget = gl.getRenderTarget();
    mesh.visible = true;
    if (target) gl.setRenderTarget(target);
    let pending: Promise<unknown>;
    try {
      pending = gl.compileAsync(mesh, camera, scene);
    } finally {
      if (target) gl.setRenderTarget(prevTarget);
      mesh.visible = wasVisible;
    }
    await pending;
  };

  try {
    for (const [stage, list] of [first, rest].entries()) {
      for (const mesh of list) {
        if (opts.isCancelled()) return;
        await compile(mesh, null);
        if (offscreen && !materialsOf(mesh).some(isTransmissive)) {
          if (opts.isCancelled()) return;
          await compile(mesh, offscreen);
        }
        await idle();
      }
      if (stage === 0 && !opts.isCancelled()) opts.onFirstStage();
    }
  } finally {
    offscreen?.dispose();
  }
}
