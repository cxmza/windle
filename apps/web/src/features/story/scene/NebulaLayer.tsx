import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Mesh, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderTarget } from 'three';
import { storyScroll } from '../story-scroll';
import {
  applyMood,
  createNebulaBackdropMaterial,
  createNebulaGeometry,
  createNebulaMaterial,
  moodAt,
  moodState,
} from './nebula';
import { NEBULA } from './scene-tokens';

const noRaycast = () => {};

function targetSize(width: number, height: number): [number, number] {
  const { scale, minPx, maxPx } = NEBULA.resolution;
  const long = Math.max(width, height, 1);
  const s = Math.min(maxPx, Math.max(minPx, long * scale)) / long;
  return [Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s))];
}

type Props = {
  reduced: boolean;
  /** Reduced motion: the chapter whose mood is shown (static, swapped with the scene). */
  shownChapter: number;
  /** Mobile mode: the cloud pass renders at half rate (soft, slow light; the upscaled texture hides it). */
  lite?: boolean;
};

/** Mobile mode: re-render the clouds at most this often (s). */
const LITE_INTERVAL = 1 / 30;

/**
 * Nebula backdrop (job: orientation — the light behind the glass shifts per chapter, so depth reads as progress).
 * Each frame: the clouds render into a small target (nebula.ts pass 1), the clip-space backdrop in the main scene
 * shows it upscaled (pass 2). Mood follows the story position, slower than the objects (the light lags behind);
 * idle drift advances only with motion allowed. Reduced motion: static clouds, mood snapped to the shown chapter,
 * rendered only on the on-demand frames the scene already makes.
 */
export function Nebula({ reduced, shownChapter, lite = false }: Props) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  // GPU resources: created once, disposed in the effect below (identity must not depend on compiler memoization)
  const res = useMemo(() => {
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
  }, []);
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
    const [w, h] = targetSize(size.width, size.height);
    res.target.setSize(w, h);
    res.clouds.uniforms.uAspect.value = size.width / Math.max(1, size.height);
    invalidate();
  }, [res, size.width, size.height, invalidate]);

  const mood = useRef({ current: moodState(shownChapter), target: moodState(shownChapter), time: 0, since: Infinity });
  const shown = useRef({ chapter: shownChapter, reduced });
  useEffect(() => {
    shown.current = { chapter: shownChapter, reduced };
    invalidate();
  }, [shownChapter, reduced, invalidate]);

  useFrame((_, delta) => {
    const m = mood.current;
    const u = res.clouds.uniforms;
    const dt = Math.min(delta, 0.1);
    if (shown.current.reduced) moodAt(shown.current.chapter, 0, m.target);
    else moodAt(storyScroll.chapter, storyScroll.transition, m.target);
    applyMood(m.current, m.target, shown.current.reduced ? 1 : 1 - Math.exp(-NEBULA.followRate * dt), u);
    if (!shown.current.reduced) m.time += dt;
    u.uTime.value = m.time;
    m.since += dt;
    if (lite && !shown.current.reduced && m.since < LITE_INTERVAL) return;
    m.since = 0;

    const prev = gl.getRenderTarget();
    gl.setRenderTarget(res.target);
    gl.render(res.cloudScene, res.camera);
    gl.setRenderTarget(prev);
  });

  return (
    <mesh
      geometry={res.geometry}
      material={res.backdrop}
      renderOrder={-1}
      frustumCulled={false}
      raycast={noRaycast}
      userData={{ warmFirst: true }}
    />
  );
}
