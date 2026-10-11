import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Group,
  type InstancedMesh,
  type Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Vector3,
} from 'three';
import { cn } from '@/lib/cn';
import { gsap } from '@/lib/gsap';
import { DUR, INTRO } from '@/lib/motion-tokens';
import { REDUCED_MOTION_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { storyScroll, useActiveChapter, whenStoryReady } from '../story-scroll';
import { applyEngraving } from './engrave';
import { createShardGeometry, createShardSeeds } from './geometry';
import { Logos, type PointerState } from './Logos';
import { measureMarkSlots, sameSlots } from './mark-slots';
import { Nebula } from './NebulaLayer';
import { HALF_OFFSET, type LayoutCtx, type MarkSlots, poseAt, SLAB_COUNT, scenePose, type Xform } from './poses';
import { PREPARED } from './prepared';
import { QualityGovernor } from './quality';
import {
  DPR,
  ENGRAVE,
  FOLLOW_RATE,
  FOV,
  GLOW,
  HERO_CHROME,
  HERO_GLASS,
  INTRO_DEPTH,
  LAYOUT,
  MARK,
  PARALLAX,
  RIM_LIGHTS,
  SCENE_COLOR,
  SHARDS,
} from './scene-tokens';
import { bakeStudioEnv } from './studio-env';
import { useMark } from './use-mark';
import { precompileScene } from './warmup';

// StoryCanvas builds the scene's geometries in idle slots between this chunk's arrival and the Canvas mount
export { sceneWarmJobs } from './prepared';

type Tier = 'high' | 'low';

const NARROW_QUERY = '(max-width: 767px)';
/** Mobile mode (narrow or touch-first): lower DPR cap and a half-rate nebula pass. Layout follows NARROW_QUERY only. */
const COARSE_QUERY = '(pointer: coarse)';
/** Quality steps (quality.ts): 0 DPR max, 1 DPR mid, 2 DPR min, 3 low tier (no transmission). */
const DPR_BY_STEP = [DPR.max, DPR.mid, DPR.min, DPR.min] as const;

const ink = (freq: number, strength: number) => ({
  freq,
  strength,
  ink: SCENE_COLOR.highlight,
  rimInk: SCENE_COLOR.glow,
});

/** Glass (high tier: real transmission; low tier: polished near-chrome living on env reflections), engraved. */
function createGlass(tier: Tier, freq: number) {
  const m =
    tier === 'high'
      ? new MeshPhysicalMaterial({
          color: SCENE_COLOR.glass,
          transmission: 1,
          thickness: 0.8,
          roughness: 0.05,
          ior: 1.45,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          envMapIntensity: 1.6,
          attenuationColor: SCENE_COLOR.rim,
          attenuationDistance: 2.5,
          emissive: SCENE_COLOR.glow,
          emissiveIntensity: 0,
        })
      : new MeshPhysicalMaterial({
          color: SCENE_COLOR.chrome,
          roughness: 0.1,
          metalness: 0.85,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.8,
          emissive: SCENE_COLOR.glow,
          emissiveIntensity: 0,
        });
  return applyEngraving(m, ink(freq, ENGRAVE.strength.glass));
}

function follow(obj: Object3D, t: Xform, k: number) {
  obj.position.x += (t.p[0] - obj.position.x) * k;
  obj.position.y += (t.p[1] - obj.position.y) * k;
  obj.position.z += (t.p[2] - obj.position.z) * k;
  obj.rotation.x += (t.r[0] - obj.rotation.x) * k;
  obj.rotation.y += (t.r[1] - obj.rotation.y) * k;
  obj.rotation.z += (t.r[2] - obj.rotation.z) * k;
  const s = obj.scale.x + (t.s - obj.scale.x) * k;
  obj.scale.setScalar(s);
  obj.visible = s > 0.002;
}

interface RigProps {
  reduced: boolean;
  tier: Tier;
  narrow: boolean;
  /** Reduced motion: the chapter whose static pose is shown (swapped behind a crossfade). */
  shownChapter: number;
  /** Shaders are compiled: start the intro. */
  ready: boolean;
  pointer: RefObject<PointerState>;
  /** Measured free squares for the mark (mark-slots.ts). */
  slots: MarkSlots;
}

function Rig({ reduced, tier, narrow, shownChapter, ready, pointer, slots }: RigProps) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);

  // Layout context: rebuilt only when the breakpoint, viewport or measured slots change; useFrame reads the ref.
  const layout = useMemo<LayoutCtx>(
    () => ({
      ...(narrow ? LAYOUT.narrow : LAYOUT.wide),
      slots,
      bands: narrow ? slots.bands : undefined,
      view: {
        tanHalfFov: Math.tan(((narrow ? FOV.narrow : FOV.wide) * Math.PI) / 360),
        aspect: size.width / Math.max(1, size.height),
      },
    }),
    [narrow, slots, size.width, size.height],
  );
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
    invalidate();
  }, [layout, invalidate]);

  // useMemo here is about GPU resource lifetime (create once per tier, dispose in the effect below),
  // not render performance — identity must not depend on the compiler's memoization heuristics.
  // The extruded/rounded ones were usually built in idle slots before the mount (prepared.ts).
  const geo = useMemo(
    () => ({
      mark: PREPARED.mark[tier].take(),
      half: PREPARED.half.take(),
      slab: PREPARED.slab.take(),
      ring: PREPARED.ring.take(),
      portal: PREPARED.portal.take(),
      shard: createShardGeometry(),
      plane: new PlaneGeometry(1, 1),
    }),
    [tier],
  );
  const mat = useMemo(
    () => ({
      mark:
        tier === 'high'
          ? applyEngraving(
              new MeshPhysicalMaterial({
                color: HERO_GLASS.tint,
                transmission: 1,
                thickness: HERO_GLASS.thickness,
                roughness: HERO_GLASS.roughness,
                ior: 1.4,
                clearcoat: 1,
                clearcoatRoughness: HERO_GLASS.clearcoatRoughness,
                envMapIntensity: HERO_GLASS.envMapIntensity,
                attenuationColor: HERO_GLASS.attenuation,
                attenuationDistance: HERO_GLASS.attenuationDistance,
              }),
              {
                ...ink(ENGRAVE.freq.hero, ENGRAVE.strength.glass),
                rimInk: HERO_GLASS.rimInk,
                rimGlow: HERO_GLASS.rimGlow,
                faceHatch: HERO_GLASS.faceHatch,
              },
            )
          : // low tier: mirror chrome reads as a material without a transmission pass
            applyEngraving(
              new MeshPhysicalMaterial({
                color: HERO_CHROME.tint,
                metalness: 1,
                roughness: 0.1,
                clearcoat: HERO_CHROME.clearcoat,
                clearcoatRoughness: 0.05,
                envMapIntensity: HERO_CHROME.envMapIntensity,
              }),
              {
                ...ink(ENGRAVE.freq.hero, ENGRAVE.strength.chrome),
                rimInk: HERO_GLASS.rimInk,
                rimGlow: HERO_GLASS.rimGlow,
                faceHatch: HERO_GLASS.faceHatch,
              },
            ),
      glassShip: createGlass(tier, ENGRAVE.freq.cube),
      glassSlash: createGlass(tier, ENGRAVE.freq.cube),
      chrome: applyEngraving(
        new MeshPhysicalMaterial({ color: SCENE_COLOR.chrome, metalness: 1, roughness: 0.14, envMapIntensity: 1.5 }),
        ink(ENGRAVE.freq.ring, ENGRAVE.strength.chrome),
      ),
      // black-navy lacquered metal: the body stays dark, clearcoat and metal pick up blue rims from the studio
      slab: applyEngraving(
        new MeshPhysicalMaterial({
          color: SCENE_COLOR.slab,
          metalness: 0.6,
          roughness: 0.28,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          envMapIntensity: 2.4,
        }),
        ink(ENGRAVE.freq.slab, ENGRAVE.strength.slab),
      ),
      glowBar: new MeshBasicMaterial({ color: SCENE_COLOR.light, toneMapped: false }),
    }),
    [tier],
  );
  const shardCount = tier === 'high' ? SHARDS.high : SHARDS.low;
  const seeds = useMemo(() => createShardSeeds(shardCount), [shardCount]);

  useEffect(() => {
    // a mark prepared for the other tier (software GL picks low on a wide viewport) is never taken
    for (const prepared of Object.values(PREPARED.mark)) prepared.drop();
    return () => {
      for (const g of Object.values(geo)) g.dispose();
    };
  }, [geo]);
  useEffect(
    () => () => {
      for (const m of Object.values(mat)) m.dispose();
    },
    [mat],
  );

  const introGroup = useRef<Group>(null);
  const mark = useMark(reduced);
  const markSpin = useRef<Group>(null);
  const markRot = useRef(new Vector3());
  const cube = useRef<Group>(null);
  const shipHalf = useRef<Mesh>(null);
  const slashHalf = useRef<Mesh>(null);
  const glowBar = useRef<Mesh>(null);
  const shards = useRef<InstancedMesh>(null);
  const ring = useRef<Mesh>(null);
  const portal = useRef<Mesh>(null);
  const slabs = useRef<Array<Mesh | null>>([]);
  const scalars = useRef({ split: 0, lift: 0, glow: 0, shatter: 0 });
  const cam = useRef({ p: new Vector3(0, 0, 8), look: new Vector3(), target: new Vector3() });
  const intro = useRef({ v: reduced ? 1 : 0 });
  const snap = useRef(true);
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = narrow ? FOV.narrow : FOV.wide;
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, narrow, invalidate]);

  // Hero object arrives from depth once its shaders are compiled (no first-frame freeze mid-flight).
  useEffect(() => {
    if (reduced) {
      intro.current.v = 1;
      return;
    }
    if (!ready) return;
    const tween = gsap.to(intro.current, { v: 1, duration: DUR.cinematic, ease: 'decelerate', delay: INTRO.object });
    return () => {
      tween.kill();
    };
  }, [reduced, ready]);

  // Reduced motion renders on demand: the swapped-in chapter is snapped (no travel) in one frame.
  const shown = useRef({ chapter: shownChapter, reduced });
  useEffect(() => {
    shown.current = { chapter: shownChapter, reduced };
    snap.current = true;
    invalidate();
  }, [shownChapter, reduced, invalidate]);
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [ready, invalidate]);

  useFrame((state, delta) => {
    const ctx = layoutRef.current;
    const pose = shown.current.reduced
      ? scenePose(shown.current.chapter, 0.5, ctx)
      : poseAt(storyScroll.chapter, storyScroll.hold, storyScroll.transition, ctx);
    const k = reduced || snap.current ? 1 : 1 - Math.exp(-FOLLOW_RATE * Math.min(delta, 0.1));
    snap.current = false;
    const time = state.clock.elapsedTime;

    const markRoot = mark.root.current;
    if (markRoot) {
      // position + scale on the root; rotation lives below the (screen-aligned) jelly group
      const t = pose.monolith;
      markRoot.position.x += (t.p[0] - markRoot.position.x) * k;
      markRoot.position.y += (t.p[1] - markRoot.position.y) * k;
      markRoot.position.z += (t.p[2] - markRoot.position.z) * k;
      const s = markRoot.scale.x + (t.s - markRoot.scale.x) * k;
      markRoot.scale.setScalar(s);
      markRoot.visible = s > 0.002;
      const rot = markRot.current;
      rot.x += (t.r[0] - rot.x) * k;
      rot.y += (t.r[1] - rot.y) * k;
      rot.z += (t.r[2] - rot.z) * k;
      const sway = reduced ? 0 : Math.sin(time * MARK.sway.speed) * MARK.sway.amp;
      markSpin.current?.rotation.set(rot.x, rot.y + sway, rot.z);
    }
    if (introGroup.current) {
      const e = intro.current.v;
      introGroup.current.position.z = -(1 - e) * INTRO_DEPTH;
      introGroup.current.scale.setScalar(0.6 + 0.4 * e);
    }
    mark.tick({ camera: state.camera, delta: Math.min(delta, 0.1), intro: intro.current.v });

    if (cube.current) follow(cube.current, pose.cube, k);
    const sc = scalars.current;
    sc.split += (pose.split - sc.split) * k;
    sc.lift += (pose.lift - sc.lift) * k;
    sc.glow += (pose.glow - sc.glow) * k;
    sc.shatter += (pose.shatter - sc.shatter) * k;
    shipHalf.current?.position.set(-HALF_OFFSET - sc.split / 2, sc.lift, 0);
    mat.glassShip.emissiveIntensity = sc.glow * GLOW.emissive;
    if (glowBar.current) {
      // a light bar inside the SHIP half's silhouette: only transmission (high tier) shows it, bent by the glass
      const g = sc.glow * GLOW.bar;
      glowBar.current.scale.set(0.06, 0.9 * g, 1);
      glowBar.current.visible = tier === 'high' && g > 0.01;
    }
    const shattered = sc.shatter >= 0.01;
    const slashX = HALF_OFFSET + sc.split / 2;
    if (slashHalf.current) {
      slashHalf.current.position.set(slashX, 0, 0);
      slashHalf.current.visible = !shattered;
    }
    const inst = shards.current;
    if (inst) {
      inst.visible = shattered;
      if (shattered) {
        const s = sc.shatter;
        for (let i = 0; i < seeds.length; i++) {
          const seed = seeds[i];
          if (!seed) continue;
          const [ox, oy, oz] = seed.offset;
          const [vx, vy, vz] = seed.velocity;
          dummy.position.set(slashX + ox + vx * s * 1.6, oy + vy * s - 4.2 * s * s, oz + vz * s);
          dummy.rotation.set(seed.spin[0] * s, seed.spin[1] * s, seed.spin[2] * s);
          dummy.scale.setScalar(seed.size);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        }
        inst.instanceMatrix.needsUpdate = true;
      }
    }

    if (ring.current) follow(ring.current, pose.ring, k);
    if (portal.current) follow(portal.current, pose.portal, k);
    for (let i = 0; i < SLAB_COUNT; i++) {
      const mesh = slabs.current[i];
      const target = pose.slabs[i];
      if (mesh && target) follow(mesh, target, k);
    }

    const c = cam.current;
    c.target.set(...pose.cam.p);
    c.p.lerp(c.target, k);
    c.target.set(...pose.cam.look);
    c.look.lerp(c.target, k);
    const pt = pointer.current;
    const pk = reduced ? 0 : 1 - Math.exp(-3 * Math.min(delta, 0.1));
    pt.sx += (pt.x - pt.sx) * pk;
    pt.sy += (pt.y - pt.sy) * pk;

    state.camera.position.set(c.p.x + pt.sx * PARALLAX.x, c.p.y - pt.sy * PARALLAX.y, c.p.z);
    state.camera.lookAt(c.look);
  });

  return (
    <>
      <group ref={introGroup}>
        <group ref={mark.root} scale={0}>
          <group ref={mark.jelly} matrixAutoUpdate={false}>
            <group ref={markSpin}>
              <mesh
                geometry={geo.mark}
                material={mat.mark}
                userData={{ warmFirst: true }}
                raycast={mark.raycast}
                {...mark.handlers}
              />
            </group>
          </group>
        </group>
      </group>

      <group ref={cube} scale={0}>
        <mesh ref={shipHalf} geometry={geo.half} material={mat.glassShip} position={[-HALF_OFFSET, 0, 0]}>
          <mesh ref={glowBar} geometry={geo.plane} material={mat.glowBar} position={[0, 0, -0.7]} visible={false} />
        </mesh>
        <mesh ref={slashHalf} geometry={geo.half} material={mat.glassSlash} position={[HALF_OFFSET, 0, 0]} />
        <instancedMesh
          ref={shards}
          args={[geo.shard, mat.glassSlash, seeds.length]}
          visible={false}
          frustumCulled={false}
        />
      </group>

      <mesh ref={ring} geometry={geo.ring} material={mat.chrome} scale={0} />
      <mesh ref={portal} geometry={geo.portal} material={mat.chrome} scale={0} />
      {Array.from({ length: SLAB_COUNT }, (_, k) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length, never reordered
          key={k}
          ref={(m) => {
            slabs.current[k] = m;
          }}
          geometry={geo.slab}
          material={mat.slab}
          scale={0}
        />
      ))}
    </>
  );
}

/**
 * Navy studio: PMREM env baked once from emissive planes (studio-env.ts) + electric-blue rim lights.
 * The bake is async (its filter shaders compile in parallel); `onEnv` gates the scene warmup, because every lit
 * program is keyed on the env map — compiling before it exists would compile everything twice.
 */
function Studio({ onEnv }: { onEnv: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    let cancelled = false;
    let target: Awaited<ReturnType<typeof bakeStudioEnv>> = null;
    void bakeStudioEnv(gl, () => cancelled).then((t) => {
      if (cancelled) {
        t?.dispose();
        return;
      }
      target = t;
      if (t) scene.environment = t.texture;
      onEnv();
    });
    return () => {
      cancelled = true;
      scene.environment = null;
      target?.dispose();
    };
  }, [gl, scene, onEnv]);
  return (
    <>
      {RIM_LIGHTS.map(([x, y, z, intensity, role]) => (
        <directionalLight key={role} position={[x, y, z]} intensity={intensity} color={SCENE_COLOR[role]} />
      ))}
    </>
  );
}

/** Compiles every program in idle slices before the loop starts (warmup.ts); re-runs when the tier swaps materials. */
function Warmup({ tier, enabled, onReady }: { tier: Tier; enabled: boolean; onReady: (tier: Tier) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    precompileScene(gl, scene, camera, {
      transmission: tier === 'high',
      isCancelled: () => cancelled,
      onFirstStage: () => onReady(tier),
      onReveal: () => invalidate(),
    }).catch(() => {
      // compile errors surface on first render anyway; never keep the scene hidden because of the warmup
      if (!cancelled) onReady(tier);
    });
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, tier, enabled, onReady, invalidate]);
  return null;
}

/** Decline-only adaptive quality (quality.ts). Off in reduced motion: on-demand frames say nothing about fps. */
function Governor({ enabled, maxStep, onStep }: { enabled: boolean; maxStep: number; onStep: (s: number) => void }) {
  const gov = useRef<QualityGovernor | null>(null);
  useFrame((_, delta) => {
    if (!enabled) return;
    gov.current ??= new QualityGovernor(maxStep);
    if (gov.current.tick(delta)) onStep(gov.current.step);
  });
  return null;
}

/**
 * True on a CPU rasteriser. Measured (headless Chromium, SwiftShader): a full-screen nebula at DPR 1.75 kept the main
 * thread in back-to-back ~475 ms tasks; e2e pointer input timed out. Such clients get DPR 1, the low tier and no
 * WebGL backdrop.
 */
function isSoftwareRenderer(ctx: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = ctx.getExtension('WEBGL_debug_renderer_info');
  const name = String(ctx.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : ctx.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

export default function StoryScene() {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);
  const mobile = useMediaQuery(COARSE_QUERY) || narrow;
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(true);
  const [readyTier, setReadyTier] = useState<Tier | null>(null);
  const [envReady, setEnvReady] = useState(false);
  // software GL (SwiftShader, llvmpipe: GPU blocklisted or headless): cheapest path — see isSoftwareRenderer
  const [software, setSoftware] = useState(false);
  const tier: Tier = narrow || software || step >= 3 ? 'low' : 'high';
  const ready = readyTier === tier;
  const dpr = software ? DPR.min : Math.min(DPR_BY_STEP[step] ?? DPR.min, mobile ? DPR.narrowMax : DPR.max);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<PointerState>({ x: 0, y: 0, sx: 0, sy: 0 });
  const [slots, setSlots] = useState<MarkSlots>({});

  // The mark's free squares depend on the text layout: measure on resize and once the display font has loaded.
  useEffect(() => {
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = measureMarkSlots();
        setSlots((prev) => (sameSlots(prev, next) ? prev : next));
      });
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(document.documentElement);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) run();
    });
    // the chapters below the hero mount after first paint (Story.tsx): the CTA slot and the narrow bands need them
    void whenStoryReady().then(() => {
      if (alive) run();
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Reduced motion: no camera travel. The scene swaps per chapter behind a short canvas crossfade.
  const { active } = useActiveChapter();
  const [shown, setShown] = useState(active);
  const [swapping, setSwapping] = useState(false);
  useEffect(() => {
    if (!reduced || active === shown) return;
    setSwapping(true);
    const id = window.setTimeout(() => {
      setShown(active);
      setSwapping(false);
    }, DUR.instant * 1000);
    return () => window.clearTimeout(id);
  }, [reduced, active, shown]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reduced]);

  // Pause the render loop when the tab is hidden or the canvas is off screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let onScreen = true;
    const sync = () => setRunning(onScreen && document.visibilityState === 'visible');
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    // Fade in on the first compiled frame (job: continuity — the CSS nebula poster under the canvas has the same
    // light, so WebGL taking over reads as the clouds sharpening, not a pop). Reduced motion: the instant crossfade.
    <div
      ref={wrapRef}
      className={cn(
        'absolute inset-0 transition-opacity ease-standard',
        ready && !reduced && !swapping ? 'duration-(--dur-slower)' : 'duration-(--dur-instant)',
      )}
      style={{ opacity: swapping || !ready ? 0 : 1 }}
    >
      <Canvas
        dpr={[DPR.min, dpr]}
        frameloop={!running || !ready ? 'never' : reduced ? 'demand' : 'always'}
        camera={{ fov: narrow ? FOV.narrow : FOV.wide, position: [0, 0, 8], near: 0.1, far: 60 }}
        // transparent clear until the nebula draws: the CSS poster (StoryCanvas) shows through before that
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ pointerEvents: 'none' }}
        // DOM content sits above the canvas: R3F listens on the document and raycasts only the mark (the one object
        // with handlers). Listeners are passive; only a confirmed drag on the mark captures input (use-mark.ts).
        eventSource={document.documentElement}
        eventPrefix="client"
        // the canvas is fixed full-viewport: scrolling never moves it, so don't re-measure (layout read) on every scroll
        resize={{ scroll: false }}
        onCreated={({ gl }) => {
          // the per-program status/info-log query is a synchronous GPU round-trip; keep it for dev only
          gl.debug.checkShaderErrors = import.meta.env.DEV;
          if (isSoftwareRenderer(gl.getContext())) setSoftware(true);
        }}
      >
        <Studio onEnv={() => setEnvReady(true)} />
        {/* software GL: no WebGL nebula (a full-screen pass costs ~0.5 s/frame there); the CSS poster shows instead */}
        {!software && <Nebula reduced={reduced} shownChapter={shown} lite={mobile} />}
        <Rig
          reduced={reduced}
          tier={tier}
          narrow={narrow}
          shownChapter={shown}
          ready={ready}
          pointer={pointer}
          slots={slots}
        />
        <Logos reduced={reduced} shownChapter={shown} pointer={pointer} />
        <Warmup tier={tier} enabled={envReady} onReady={setReadyTier} />
        <Governor enabled={ready && !reduced} maxStep={narrow ? 2 : 3} onStep={setStep} />
      </Canvas>
    </div>
  );
}
