import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { Color, DoubleSide, type Group, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene } from 'three';
import { LOOK, STUDIO } from './look';
import { createMarkGeometry, MARK } from './mark-geometry';
import { clamp, composePose, initialPoseState, POSE, stepPose } from './pose';

type MarkSceneProps = {
  reduced: boolean;
  /** Called once, after the first frame is on screen. */
  onReady: () => void;
  /** WebGL context lost or unusable: the caller falls back to the poster. */
  onFail: () => void;
};

/** Idle redraw rate (ms). The sway is a few degrees per minute, so a slow tick is enough. */
const IDLE_TICK_MS = 80;

/** Studio the metal reflects: a dark box with a few HDR emissive strips, baked once into a PMREM environment. */
function useStudio() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const studio = new Scene();
    studio.background = new Color(LOOK.void);
    const geometries: PlaneGeometry[] = [];
    const materials: MeshBasicMaterial[] = [];
    for (const strip of STUDIO) {
      const geometry = new PlaneGeometry(strip.size[0], strip.size[1]);
      const material = new MeshBasicMaterial({
        color: new Color(strip.color).multiplyScalar(strip.intensity),
        side: DoubleSide,
      });
      material.toneMapped = false;
      const mesh = new Mesh(geometry, material);
      mesh.position.set(...strip.position);
      mesh.lookAt(0, 0, 0);
      studio.add(mesh);
      geometries.push(geometry);
      materials.push(material);
    }
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(studio, 0.02);
    scene.environment = target.texture;
    pmrem.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    };
  }, [gl, scene, invalidate]);
}

function readNumber(el: Element | null, name: string, fallback: number) {
  if (!el) return fallback;
  const v = Number.parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

type Fit = { fw: number; fh: number; x: number; y: number };

function Mark({ reduced, onReady }: Pick<MarkSceneProps, 'reduced' | 'onReady'>) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const [geometry] = useState(createMarkGeometry);
  const pose = useRef(initialPoseState());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const ready = useRef(false);
  const fit = useRef<Fit>({ fw: 0.86, fh: 0.66, x: 0, y: 0.09 });

  useStudio();

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  // Where the mark sits in the panel is declared in CSS (custom properties), so the poster and the 3D mark agree.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read on every canvas resize (media queries change the vars)
  useEffect(() => {
    const host = gl.domElement.parentElement;
    fit.current = {
      fw: readNumber(host, '--mark-fw', 0.98),
      fh: readNumber(host, '--mark-fh', 0.72),
      x: readNumber(host, '--mark-x', 0),
      y: readNumber(host, '--mark-y', 0.09),
    };
    invalidate();
  }, [gl, size, invalidate]);

  // Pointer tilt + drag. Skipped entirely under reduced motion: the pose is static.
  useEffect(() => {
    if (reduced) return;
    const el = gl.domElement;
    let last = { x: 0, y: 0 };
    const norm = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return {
        x: clamp(((e.clientX - r.left) / r.width) * 2 - 1, 1),
        y: clamp(((e.clientY - r.top) / r.height) * 2 - 1, 1),
      };
    };
    const onMove = (e: PointerEvent) => {
      if (dragging.current) {
        const p = pose.current;
        p.drag.yaw = clamp(p.drag.yaw + (e.clientX - last.x) * POSE.dragGain, POSE.dragMax);
        p.drag.pitch = clamp(p.drag.pitch + (e.clientY - last.y) * POSE.dragGain, POSE.dragMax);
        p.dragVel.yaw = 0;
        p.dragVel.pitch = 0;
        last = { x: e.clientX, y: e.clientY };
      } else if (e.pointerType === 'mouse') {
        pointer.current = norm(e);
      }
      invalidate();
    };
    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.dataset.dragging = 'true';
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      invalidate();
    };
    const onLeave = () => {
      pointer.current = null;
      invalidate();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, reduced, invalidate]);

  // Slow idle tick (demand frameloop): paused while the tab is hidden or the canvas is off screen.
  useEffect(() => {
    if (reduced) return;
    const el = gl.domElement;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(el);
    const id = window.setInterval(() => {
      if (!document.hidden && visible) invalidate();
    }, IDLE_TICK_MS);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, [gl, reduced, invalidate]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const { viewport } = state;
    const f = fit.current;
    const width = Math.min(viewport.width * f.fw, viewport.height * f.fh);
    const scale = width / MARK.size;
    g.scale.setScalar(scale);
    g.position.set(viewport.width * f.x, viewport.height * f.y, 0);

    const { settled } = reduced ? { settled: true } : stepPose(pose.current, delta, pointer.current, dragging.current);
    const p = composePose(pose.current, state.clock.elapsedTime, !reduced);
    g.rotation.set(p.pitch, p.yaw, 0);
    // Keep drawing while the pose is still moving; the idle tick covers the sway.
    if (!settled) state.invalidate();

    if (!ready.current) {
      ready.current = true;
      onReady();
    }
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial color={LOOK.body} {...LOOK.metal} />
      </mesh>
    </group>
  );
}

export function MarkScene({ reduced, onReady, onFail }: MarkSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ fov: 28, position: [0, 0, 8], near: 1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', onFail, { once: true });
      }}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0 }}
      className="brand-canvas"
    >
      <Mark reduced={reduced} onReady={onReady} />
      {/* Two hard back lights so the chamfer edges catch a thin, bright line even where the env is dark. */}
      <directionalLight color={LOOK.blue} intensity={5} position={[-4, 2, -3]} />
      <directionalLight color={LOOK.cyan} intensity={4} position={[5, 3, -2]} />
      <directionalLight color={LOOK.ice} intensity={0.5} position={[1, 4, 6]} />
      {/* A close light top-left of the face: it falls off across the flat front so the face is a gradient, not a void. */}
      <pointLight color={LOOK.cyan} intensity={26} distance={0} decay={2} position={[-2.2, 2.6, 3]} />
    </Canvas>
  );
}
