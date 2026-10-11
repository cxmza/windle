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
 * compiles while the main thread polls). The synchronous part (shader source, compile/link calls) is issued one mesh
 * per idle slot, so no single long task; the compiles themselves run in parallel and each stage awaits all of them.
 * Measured (desktop-4x): awaiting each program before issuing the next serialised D3D compiles of 0.1-0.4 s each, so
 * the second stage was still compiling 6-8 s in, and a first scroll reached the cube/slabs first: 135-410 ms
 * synchronous links mid-scroll. Objects are forced
 * visible only for the synchronous part of the call. Opaque meshes are compiled a second time with a render target
 * bound, because the transmission pass renders them off-screen with different program parameters (no tone mapping,
 * linear output) — without that the first transmissive frame would still link programs synchronously.
 * Objects flagged `userData.warmFirst` (what the hero shows) go first; `onFirstStage` then lets the loop start.
 * A mesh can also name an off-screen pass it depends on (`userData.warmOffscreen`, see OffscreenPass): that scene is
 * compiled with its target bound, in the same stage (the nebula's cloud pass linked synchronously on the first frame
 * otherwise: ~60 ms, desktop 1x).
 */

/** An off-screen render a mesh depends on (e.g. the nebula cloud pass into its small target). */
export interface OffscreenPass {
  scene: Scene;
  camera: Camera;
  target: WebGLRenderTarget;
}

function offscreenPassOf(mesh: Mesh): OffscreenPass | null {
  const pass = mesh.userData.warmOffscreen as Partial<OffscreenPass> | undefined;
  return pass?.scene && pass.camera && pass.target ? (pass as OffscreenPass) : null;
}

function isMesh(o: Object3D): o is Mesh {
  return (o as Partial<Mesh>).isMesh === true;
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function isTransmissive(m: Material): boolean {
  return 'transmission' in m && typeof m.transmission === 'number' && m.transmission > 0;
}

/** Resolves in the next idle period (bounded wait: 120 ms on a busy main thread). */
export function idle(): Promise<void> {
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
  /** A held-back mesh group joined the render: an on-demand loop (reduced motion) needs a frame to show it. */
  onReveal?: () => void;
}

export async function precompileScene(gl: WebGLRenderer, scene: Scene, camera: Camera, opts: WarmupOptions) {
  // one representative per program group (same materials, same mesh kind); the group shares its programs
  const groups = new Map<string, Mesh[]>();
  const first: Mesh[] = [];
  const rest: Mesh[] = [];
  scene.traverse((o) => {
    if (!isMesh(o)) return;
    const mats = materialsOf(o);
    const key = `${(o as Partial<{ isInstancedMesh: boolean }>).isInstancedMesh ? 'i' : 'm'}:${mats.map((m) => m.uuid).join(',')}`;
    const group = groups.get(key);
    if (group) {
      group.push(o);
      return;
    }
    groups.set(key, [o]);
    (o.userData.warmFirst === true ? first : rest).push(o);
  });
  const groupOf = (mesh: Mesh) => [...groups.values()].find((g) => g[0] === mesh) ?? [mesh];

  // The loop starts after the first stage. Until its programs are linked, every later-stage mesh is kept out of the
  // render through its layers (the camera never sees an empty mask; compile() ignores layers): a reader scrolling
  // before the second stage is done gets the object a moment later instead of a synchronous link mid-scroll.
  const hidden = new Map<Mesh, number>();
  const hide = (mesh: Mesh) => {
    if (hidden.has(mesh)) return;
    hidden.set(mesh, mesh.layers.mask);
    mesh.layers.disableAll();
  };
  const reveal = (mesh: Mesh) => {
    const mask = hidden.get(mesh);
    if (mask === undefined) return;
    mesh.layers.mask = mask;
    hidden.delete(mesh);
  };
  for (const rep of rest) for (const mesh of groupOf(rep)) hide(mesh);

  const offscreen = opts.transmission ? new WebGLRenderTarget(1, 1, { type: HalfFloatType }) : null;
  // Both helpers only issue the compile (the synchronous part) and return its completion; the GPU compiles in parallel.
  const compile = (mesh: Mesh, target: WebGLRenderTarget | null): Promise<unknown> => {
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
    return pending;
  };

  const compileOffscreen = (pass: OffscreenPass): Promise<unknown> => {
    const prevTarget = gl.getRenderTarget();
    let pending: Promise<unknown>;
    try {
      gl.setRenderTarget(pass.target);
      pending = gl.compileAsync(pass.scene, pass.camera);
    } finally {
      gl.setRenderTarget(prevTarget);
    }
    return pending;
  };

  try {
    for (const [stage, list] of [first, rest].entries()) {
      const pending: Promise<unknown>[] = [];
      for (const mesh of list) {
        if (opts.isCancelled()) return;
        const programs = [compile(mesh, null)];
        if (offscreen && !materialsOf(mesh).some(isTransmissive)) programs.push(compile(mesh, offscreen));
        const pass = offscreenPassOf(mesh);
        if (pass) programs.push(compileOffscreen(pass));
        // a group joins the render as soon as all of its programs are linked
        pending.push(
          Promise.all(programs).then(() => {
            for (const m of groupOf(mesh)) reveal(m);
            if (stage > 0 && !opts.isCancelled()) opts.onReveal?.();
          }),
        );
        await idle();
      }
      await Promise.all(pending);
      if (stage === 0 && !opts.isCancelled()) opts.onFirstStage();
    }
  } finally {
    offscreen?.dispose();
    // cancelled, failed or done: never leave a mesh hidden (a failed compile then surfaces on first render, as before)
    for (const mesh of [...hidden.keys()]) reveal(mesh);
  }
}
