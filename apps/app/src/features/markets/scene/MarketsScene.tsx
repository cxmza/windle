import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Color,
  DoubleSide,
  type Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
} from 'three';
import { poke, type SceneBridge } from '../scene-bridge';
import type { Market } from '../types';
import { createFaceTexture, drawFace, FACE, loadFaceFonts } from './face-texture';
import { layoutMarkets, type Placement } from './layout';
import {
  cloudTargetSize,
  createNebulaBackdropMaterial,
  createNebulaGeometry,
  createNebulaMaterial,
  NEBULA,
} from './nebula';
import { clamp, frameSlab, orbitPosition, type Spring, spring, stepSpring } from './rig';
import { CAMERA, DPR, FACE_Z, FOG, FRAME, LOOK, MOTION, ORBIT, SLAB, STUDIO } from './scene-tokens';
import { createBladeGeometry, createEdgeRingGeometry, createSlabGeometry } from './slab-geometry';

export interface MarketsSceneProps {
  markets: readonly Market[];
  now: number;
  bridge: SceneBridge;
  reduced: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
  onReady: () => void;
  onFail: () => void;
}

const noRaycast = () => {};
const HOVER_EMISSIVE = 0.05;
const PIVOT = [0, 0, CAMERA.pivotZ] as const;
const RADIUS = CAMERA.z - CAMERA.pivotZ;
const CLICK_SLOP = 6;

const isNarrow = (w: number, h: number) => w / Math.max(1, h) < 1;

interface SlabHandle {
  id: string;
  group: Group;
  placement: Placement;
  phase: number;
  lift: Spring;
  ring: Spring;
  dim: Spring;
  ringMat: MeshBasicMaterial;
  faceMat: MeshBasicMaterial;
  bodyMat: MeshPhysicalMaterial;
}
type Registry = Map<string, SlabHandle>;

interface DragState {
  moved: number;
}

/* ---------------------------------- studio ---------------------------------- */

function Studio() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const studio = new Scene();
    studio.background = new Color(LOOK.void);
    const disposables: { dispose(): void }[] = [];
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
      disposables.push(geometry, material);
    }
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(studio, 0.02);
    scene.environment = target.texture;
    pmrem.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
      for (const d of disposables) d.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

/* ---------------------------------- nebula ---------------------------------- */

interface NebulaState {
  time: number;
  shiftX: number;
  shiftY: number;
}

function Nebula({ state }: { state: NebulaState }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const [res] = useState(() => {
    const target = new WebGLRenderTarget(1, 1, { depthBuffer: false });
    target.texture.colorSpace = SRGBColorSpace;
    const geometry = createNebulaGeometry();
    const clouds = createNebulaMaterial();
    const backdrop = createNebulaBackdropMaterial(target.texture);
    const cloudScene = new Scene();
    const cloudMesh = new Mesh(geometry, clouds);
    cloudMesh.frustumCulled = false;
    cloudScene.add(cloudMesh);
    return { target, geometry, clouds, backdrop, cloudScene, camera: new OrthographicCamera() };
  });
  useEffect(
    () => () => {
      res.target.dispose();
      res.geometry.dispose();
      res.clouds.dispose();
      res.backdrop.dispose();
    },
    [res],
  );
  useEffect(() => {
    const [w, h] = cloudTargetSize(size.width, size.height);
    res.target.setSize(w, h);
    res.clouds.uniforms.uAspect.value = size.width / Math.max(1, size.height);
    invalidate();
  }, [res, size.width, size.height, invalidate]);

  useFrame(() => {
    const u = res.clouds.uniforms;
    u.uTime.value = state.time;
    u.uShift.value.set(state.shiftX, state.shiftY);
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(res.target);
    gl.render(res.cloudScene, res.camera);
    gl.setRenderTarget(prev);
  });

  return (
    <mesh geometry={res.geometry} material={res.backdrop} renderOrder={-1} frustumCulled={false} raycast={noRaycast} />
  );
}

/* ----------------------------------- slabs ---------------------------------- */

interface SharedSlabResources {
  body: ReturnType<typeof createSlabGeometry>;
  ring: ReturnType<typeof createEdgeRingGeometry>;
  blade: ReturnType<typeof createBladeGeometry>;
  bladeMat: MeshBasicMaterial;
  trackMat: MeshBasicMaterial;
  face: PlaneGeometry;
}

function useSharedSlabResources(): SharedSlabResources {
  const [res] = useState(() => ({
    body: createSlabGeometry(),
    ring: createEdgeRingGeometry(),
    blade: createBladeGeometry(),
    bladeMat: new MeshBasicMaterial({ color: new Color(LOOK.cyan).multiplyScalar(1.6), toneMapped: false }),
    trackMat: new MeshBasicMaterial({ color: LOOK.navy, transparent: true, opacity: 0.9 }),
    face: new PlaneGeometry(FACE.width, FACE.height),
  }));
  useEffect(
    () => () => {
      res.body.dispose();
      res.ring.dispose();
      res.blade.dispose();
      res.bladeMat.dispose();
      res.trackMat.dispose();
      res.face.dispose();
    },
    [res],
  );
  return res;
}

const INNER_W = SLAB.width - SLAB.pad * 2;
const LEFT = -SLAB.width / 2 + SLAB.pad;
const BLADE_Y = -SLAB.height / 2 + SLAB.blade.fromBottom;
const TEXT_Z = FACE_Z + 0.003;
const faceTextureWidth = () => (window.matchMedia?.('(max-width: 47.99rem)').matches ? 768 : 1024);

interface SlabProps {
  market: Market;
  placement: Placement;
  now: number;
  shared: SharedSlabResources;
  registry: Registry;
  bridge: SceneBridge;
  drag: DragState;
  onOpen: (id: string) => void;
}

function Slab({ market, placement, now, shared, registry, bridge, drag, onOpen }: SlabProps) {
  const group = useRef<Group>(null);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [face] = useState(() => createFaceTexture(faceTextureWidth(), Math.min(8, gl.capabilities.getMaxAnisotropy())));
  const [mats] = useState(() => ({
    face: new MeshBasicMaterial({
      map: face.texture,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      toneMapped: false,
    }),
    body: new MeshPhysicalMaterial({
      color: LOOK.body,
      ...LOOK.metal,
      emissive: LOOK.blueBright,
      emissiveIntensity: 0,
    }),
    ring: new MeshBasicMaterial({
      color: new Color(LOOK.cyan).multiplyScalar(1.4),
      transparent: true,
      opacity: MOTION.hover.ring.idle,
      toneMapped: false,
      depthWrite: false,
    }),
  }));
  useEffect(
    () => () => {
      mats.body.dispose();
      mats.ring.dispose();
      mats.face.dispose();
      face.texture.dispose();
    },
    [mats, face],
  );

  useEffect(() => {
    drawFace(face.canvas, market, now);
    face.texture.needsUpdate = true;
    invalidate();
  }, [face, market, now, invalidate]);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const existing = registry.get(market.id);
    if (existing) {
      existing.placement = placement;
      existing.group = g;
      return;
    }
    g.position.set(placement.x, placement.y, placement.z);
    registry.set(market.id, {
      id: market.id,
      group: g,
      placement,
      phase: placement.rank * 1.7,
      lift: spring(0),
      ring: spring(MOTION.hover.ring.idle),
      dim: spring(0),
      ringMat: mats.ring,
      faceMat: mats.face,
      bodyMat: mats.body,
    });
  }, [registry, market.id, placement, mats]);
  useEffect(() => () => void registry.delete(market.id), [registry, market.id]);

  const id = market.id;
  const p = market.shipProbability;
  const tilt = (placement.rank % 2 ? 1 : -1) * 0.11;

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    bridge.hovered = id;
    gl.domElement.style.cursor = 'pointer';
    poke(bridge);
  };
  const out = () => {
    if (bridge.hovered === id) bridge.hovered = null;
    gl.domElement.style.cursor = '';
    poke(bridge);
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (drag.moved > CLICK_SLOP) return;
    onOpen(id);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: an R3F scene object, not a DOM element (keyboard path: the proxy buttons in MarketsHome)
    <group
      ref={group}
      scale={placement.scale}
      rotation={[0, tilt, 0]}
      onPointerOver={over}
      onPointerOut={out}
      onClick={click}
    >
      <mesh geometry={shared.body} material={mats.body} />
      <mesh geometry={shared.ring} material={mats.ring} raycast={noRaycast} renderOrder={1} />

      <mesh geometry={shared.face} material={mats.face} position={[0, 0, TEXT_Z]} raycast={noRaycast} renderOrder={2} />

      <mesh
        geometry={shared.blade}
        material={shared.trackMat}
        position={[LEFT, BLADE_Y, FACE_Z + 0.002]}
        scale={[INNER_W, 1, 1]}
        raycast={noRaycast}
      />
      <mesh
        geometry={shared.blade}
        material={shared.bladeMat}
        position={[LEFT, BLADE_Y, FACE_Z + 0.003]}
        scale={[Math.max(0.001, (INNER_W * p) / 100), 1, 1]}
        raycast={noRaycast}
      />
    </group>
  );
}

/* --------------------------------- director --------------------------------- */

interface DirectorProps {
  bridge: SceneBridge;
  reduced: boolean;
  registry: Registry;
  drag: DragState;
  nebula: NebulaState;
  onReady: () => void;
}

function Director({ bridge, reduced, registry, drag, nebula, onReady }: DirectorProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const st = useRef({
    yaw: 0,
    pitch: 0,
    cam: [spring(0), spring(0), spring(CAMERA.z)] as const,
    look: [spring(PIVOT[0]), spring(PIVOT[1]), spring(PIVOT[2])] as const,
    drift: 0,
    ready: false,
    timer: 0,
    mode: null as string | null,
    modeSince: 0,
    orbit: [0, 0, 0] as [number, number, number],
  });

  useEffect(() => {
    bridge.wake = invalidate;
    invalidate();
    return () => {
      bridge.wake = () => {};
      window.clearTimeout(st.current.timer);
    };
  }, [bridge, invalidate]);

  useEffect(() => {
    const narrow = isNarrow(size.width, size.height);
    camera.fov = narrow ? CAMERA.fov.narrow : CAMERA.fov.wide;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    let last: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      drag.moved = 0;
      last = { x: e.clientX, y: e.clientY };
      if (!reduced && !bridge.selected) {
        el.setPointerCapture(e.pointerId);
        el.dataset.dragging = 'true';
      }
      poke(bridge);
    };
    const onMove = (e: PointerEvent) => {
      if (last && e.buttons) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        drag.moved += Math.hypot(dx, dy);
        last = { x: e.clientX, y: e.clientY };
        if (!reduced && !bridge.selected) {
          const s = st.current;
          s.yaw = clamp(s.yaw - dx * ORBIT.gain, ORBIT.yawMax);
          s.pitch = clamp(s.pitch + dy * ORBIT.gain, ORBIT.pitchMax);
        }
      }
      poke(bridge);
    };
    const onUp = (e: PointerEvent) => {
      last = null;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      poke(bridge);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl, bridge, reduced, drag]);

  useFrame((state, delta) => {
    const s = st.current;
    const dt = Math.min(delta, 0.1);
    const now = performance.now();
    const idle = (now - bridge.lastInput) / 1000;
    const driftOn = !reduced && idle < MOTION.idle.stopAfter;
    if (driftOn) s.drift += dt;
    const D = MOTION.drift;
    const sway = reduced ? 0 : 1;

    const sel = bridge.selected ? registry.get(bridge.selected) : undefined;
    if (bridge.selected !== s.mode) {
      s.mode = bridge.selected;
      s.modeSince = now;
    }
    let tx: number;
    let ty: number;
    let tz: number;
    let lx: number;
    let ly: number;
    let lz: number;
    if (sel) {
      const p = sel.placement;
      const narrow = isNarrow(size.width, size.height);
      const f = frameSlab({
        slabW: SLAB.width * p.scale,
        slabH: SLAB.height * p.scale,
        fov: camera.fov,
        aspect: size.width / Math.max(1, size.height),
        coverRight: bridge.cover.right,
        coverBottom: bridge.cover.bottom,
        coverTop: bridge.cover.top,
        fill: narrow ? FRAME.fillNarrow : FRAME.fill,
        maxWidthShare: narrow ? FRAME.maxWidthShareNarrow : FRAME.maxWidthShare,
      });
      const z = p.z + (reduced ? 0 : MOTION.hover.lift);
      lx = p.x + f.offsetX;
      ly = p.y + f.offsetY;
      lz = z;
      tx = lx;
      ty = ly;
      tz = z + f.distance;
    } else {
      const yaw = s.yaw + sway * D.yaw * Math.sin(s.drift * D.yawRate);
      const pitch = s.pitch + sway * D.pitch * Math.sin(s.drift * D.pitchRate);
      orbitPosition(yaw, pitch, RADIUS, PIVOT, s.orbit);
      [tx, ty, tz] = s.orbit;
      [lx, ly, lz] = PIVOT;
    }

    const omega = now - s.modeSince < 1600 ? MOTION.dolly.omega : MOTION.orbit.omega;
    const targets = [tx, ty, tz, lx, ly, lz];
    const springs = [...s.cam, ...s.look];
    let transit = false;
    springs.forEach((sp, i) => {
      const t = targets[i] ?? 0;
      if (reduced) {
        sp.x = t;
        sp.v = 0;
      } else {
        stepSpring(sp, t, omega, dt);
        if (Math.abs(sp.x - t) > 0.05) transit = true;
      }
    });
    camera.position.set(s.cam[0].x, s.cam[1].x, s.cam[2].x);
    camera.lookAt(s.look[0].x, s.look[1].x, s.look[2].x);

    const R = MOTION.hover.ring;
    for (const h of registry.values()) {
      const active = bridge.hovered === h.id || bridge.focused === h.id || bridge.selected === h.id;
      const dim = bridge.selected !== null && !active;
      const liftT = active && !reduced ? MOTION.hover.lift : 0;
      const ringT = active ? R.hover : dim ? 0 : R.idle;
      const dimT = dim ? 1 : 0;
      if (reduced) {
        h.lift.x = liftT;
        h.ring.x = ringT;
        h.dim.x = dimT;
      } else {
        if (stepSpring(h.lift, liftT, MOTION.hover.omega, dt)) transit = true;
        if (stepSpring(h.ring, ringT, MOTION.hover.omega, dt)) transit = true;
        if (stepSpring(h.dim, dimT, MOTION.hover.omega, dt)) transit = true;
      }
      h.faceMat.opacity = 1 - (1 - MOTION.dimFace) * h.dim.x;
      const p = h.placement;
      const bob = sway * D.bob * Math.sin(s.drift * D.bobRate + h.phase);
      h.group.position.set(p.x, p.y + bob, p.z + h.lift.x);
      h.ringMat.opacity = h.ring.x;
      h.bodyMat.emissiveIntensity = HOVER_EMISSIVE * Math.max(0, (h.ring.x - R.idle) / (R.hover - R.idle));
    }

    nebula.time = s.drift;
    nebula.shiftX = (s.cam[0].x / RADIUS) * NEBULA.parallax;
    nebula.shiftY = (s.cam[1].x / RADIUS) * NEBULA.parallax;

    if (!s.ready) {
      s.ready = true;
      onReady();
    }

    window.clearTimeout(s.timer);
    if (transit || (driftOn && idle < MOTION.idle.throttleAfter)) state.invalidate();
    else if (driftOn) s.timer = window.setTimeout(() => state.invalidate(), 1000 / MOTION.idle.idleFps);
  });

  return null;
}

/* ---------------------------------- canvas ---------------------------------- */

type FieldProps = Omit<MarketsSceneProps, 'onFail' | 'onClose'> & { drag: DragState };

function Field({ markets, now, bridge, reduced, onOpen, onReady, drag }: FieldProps) {
  const size = useThree((s) => s.size);
  const shared = useSharedSlabResources();
  const [registry] = useState<Registry>(() => new Map());
  const [nebula] = useState<NebulaState>(() => ({ time: 0, shiftX: 0, shiftY: 0 }));
  // layout uses the mount-time clock: depth is stable while the scene is open (minute-level drift is invisible)
  const [layoutNow] = useState(now);
  const aspect = size.width / Math.max(1, size.height);
  const fov = aspect < 1 ? CAMERA.fov.narrow : CAMERA.fov.wide;
  const placements = new Map(layoutMarkets(markets, layoutNow, aspect, fov).map((p) => [p.id, p]));
  // faces are drawn with the brand fonts: wait for them, or the first texture would bake a fallback face
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadFaceFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <Nebula state={nebula} />
      {fontsReady ? (
        <>
          {markets.map((m) => {
            const placement = placements.get(m.id);
            return placement ? (
              <Slab
                key={m.id}
                market={m}
                placement={placement}
                now={now}
                shared={shared}
                registry={registry}
                bridge={bridge}
                drag={drag}
                onOpen={onOpen}
              />
            ) : null;
          })}
          <Director
            bridge={bridge}
            reduced={reduced}
            registry={registry}
            drag={drag}
            nebula={nebula}
            onReady={onReady}
          />
        </>
      ) : null}
    </>
  );
}

function dprCap(): number {
  const narrow = window.matchMedia?.('(max-width: 47.99rem), (pointer: coarse)').matches ?? false;
  return narrow ? DPR.narrowMax : DPR.max;
}

export function MarketsScene({ onFail, onClose, ...props }: MarketsSceneProps) {
  const [dpr] = useState(dprCap);
  const [drag] = useState<DragState>(() => ({ moved: 0 }));
  const { bridge } = props;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, dpr]}
      camera={{ fov: CAMERA.fov.wide, position: [0, 0, CAMERA.z], near: CAMERA.near, far: CAMERA.far }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener(
          'webglcontextlost',
          () => {
            // R3F calls forceContextLoss() after unmount, which fires this too: only a loss on a live canvas is a failure
            if (gl.domElement.isConnected) onFail();
          },
          { once: true },
        );
      }}
      onPointerMissed={() => {
        // a click on empty space closes the open market (not the release of an orbit drag)
        if (bridge.selected && drag.moved <= CLICK_SLOP) onClose();
      }}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <color attach="background" args={[LOOK.void]} />
      <fog attach="fog" args={[LOOK.void, FOG.near, FOG.far]} />
      <Studio />
      <directionalLight color={LOOK.blue} intensity={4} position={[-4, 2, -3]} />
      <directionalLight color={LOOK.cyan} intensity={3} position={[5, 3, -2]} />
      <directionalLight color={LOOK.ice} intensity={0.35} position={[1, 4, 6]} />
      <Field {...props} drag={drag} />
    </Canvas>
  );
}
