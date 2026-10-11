import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { Euler, type Group, MeshPhysicalMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CHAPTERS, LOGO_SLOT_IDS, type LogoSlotId } from '../chapters';
import { logoSlotElement, markLogoExtruded, onLogoSketched, resetLogo } from '../hand/logo-sketch';
import { applyEngraving } from './engrave';
import { createLogoParts, type LogoPartTone } from './logo-geometry';
import { ENGRAVE, LOGO, LOGO_TINT, SCENE_COLOR } from './scene-tokens';

export interface PointerState {
  x: number;
  y: number;
  /** Smoothed (Rig updates these every frame). */
  sx: number;
  sy: number;
}

const ECOSYSTEM_INDEX = CHAPTERS.findIndex((c) => c.id === 'ecosystem');

interface SlotRuntime {
  value: number;
  velocity: number;
  target: number;
  el: HTMLElement | null;
}

function createFace(tone: LogoPartTone) {
  const accent = tone === 'accent';
  // faces stay clean polished metal (no hatching): the engraving lives on the extruded sides
  return applyEngraving(
    new MeshPhysicalMaterial({
      color: accent ? SCENE_COLOR.electricBright : LOGO_TINT.face,
      metalness: accent ? 0.3 : 0.55,
      roughness: accent ? 0.25 : 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 2,
      // the white face glows cool-white so it reads as the lit "paper" of the mark on a navy page
      emissive: accent ? LOGO_TINT.emissive : SCENE_COLOR.highlight,
      emissiveIntensity: accent ? 0.45 : 0.22,
    }),
    {
      freq: ENGRAVE.freq.logo,
      strength: ENGRAVE.strength.logoFace,
      ink: SCENE_COLOR.highlight,
      rimInk: LOGO_TINT.rim,
    },
  );
}

function createSide() {
  return applyEngraving(
    new MeshPhysicalMaterial({
      color: LOGO_TINT.side,
      metalness: 0.7,
      roughness: 0.3,
      clearcoat: 0.6,
      envMapIntensity: 1.4,
      emissive: LOGO_TINT.emissive,
      emissiveIntensity: 0.08,
    }),
    {
      freq: ENGRAVE.freq.logo * 2.2,
      strength: ENGRAVE.strength.logoSide,
      ink: SCENE_COLOR.highlight,
      rimInk: LOGO_TINT.rim,
    },
  );
}

/** Semi-implicit spring step, fixed sub-steps so a long frame cannot blow it up. Carries velocity (interruptible). */
function springStep(s: SlotRuntime, dt: number) {
  const { stiffness, damping } = LOGO.spring;
  let left = Math.min(dt, 0.1);
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    s.velocity += (stiffness * (s.target - s.value) - damping * s.velocity) * h;
    s.value += s.velocity * h;
    left -= h;
  }
  if (Math.abs(s.target - s.value) < 1e-3 && Math.abs(s.velocity) < 1e-3) {
    s.value = s.target;
    s.velocity = 0;
  }
}

interface LogosProps {
  reduced: boolean;
  /** Reduced motion: the chapter whose static pose is shown. */
  shownChapter: number;
  pointer: RefObject<PointerState>;
}

/**
 * Extruded ecosystem logos placed over their DOM slots (`[data-logo-slot]`, see hand/logo-sketch.ts).
 * Job: continuity — the hand-drawn sketch becomes the real object in the same place.
 * Motion: extrude depth 0 -> 1 on a spring with a slight overshoot (brand moment), then a slow idle sway and a
 * pointer tilt. Retracts on the same spring when the slot returns to `sketch`.
 * Reduced motion: no event arrives; when the ecosystem chapter is shown the logos appear fully extruded, static.
 */
export function Logos({ reduced, shownChapter, pointer }: LogosProps) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const parts = useMemo(() => createLogoParts(), []);
  const mats = useMemo(
    () => ({ primary: createFace('primary'), accent: createFace('accent'), side: createSide() }),
    [],
  );
  useEffect(
    () => () => {
      for (const list of Object.values(parts)) for (const p of list) p.geometry.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
    [parts, mats],
  );

  const groups = useRef<Partial<Record<LogoSlotId, Group | null>>>({});
  const extrude = useRef<Partial<Record<LogoSlotId, Group | null>>>({});
  const slots = useRef<Record<LogoSlotId, SlotRuntime>>({
    solana: { value: 0, velocity: 0, target: 0, el: null },
    pumpfun: { value: 0, velocity: 0, target: 0, el: null },
    x: { value: 0, velocity: 0, target: 0, el: null },
  });
  const scratch = useMemo(() => ({ v: new Vector3(), fwd: new Vector3(), q: new Quaternion(), e: new Euler() }), []);

  // The DOM finished a sketch: start extruding right away (data-logo-state is the source of truth every frame;
  // the event only saves a frame and wakes an on-demand loop).
  useEffect(
    () =>
      onLogoSketched((slot) => {
        slots.current[slot].target = 1;
        invalidate();
      }),
    [invalidate],
  );

  // Reduced motion renders on demand: logos are pinned to DOM rects, so re-render while the reader scrolls.
  const ecoShown = reduced && shownChapter === ECOSYSTEM_INDEX;
  useEffect(() => {
    if (!ecoShown) return;
    const onScroll = () => invalidate();
    window.addEventListener('scroll', onScroll, { passive: true });
    invalidate();
    return () => window.removeEventListener('scroll', onScroll);
  }, [ecoShown, invalidate]);

  // Leaving reduced mode / unmounting: hand the slots back to the sketch.
  useEffect(
    () => () => {
      for (const id of LOGO_SLOT_IDS) if (slots.current[id].value > 0) resetLogo(id);
    },
    [],
  );

  useFrame((state, delta) => {
    // idle fast path: nothing extruded, nothing requested (no DOM reads beyond a dataset check)
    if (!reduced || !ecoShown) {
      let busy = false;
      for (const id of LOGO_SLOT_IDS) {
        const s = slots.current[id];
        if (!s.el?.isConnected) s.el = logoSlotElement(id);
        const st = s.el?.dataset.logoState;
        if (s.value !== 0 || s.velocity !== 0 || st === 'sketched' || st === 'extruded') busy = true;
      }
      if (!busy) return;
    }
    const persp = camera instanceof PerspectiveCamera ? camera : null;
    if (!persp) return;
    camera.updateMatrixWorld();
    const { v, fwd, q, e } = scratch;
    camera.getWorldDirection(fwd);
    const worldPerPx = (2 * LOGO.depth * Math.tan((persp.fov * Math.PI) / 360)) / Math.max(size.height, 1);
    const pt = pointer.current;
    const time = state.clock.elapsedTime;

    for (const [i, id] of LOGO_SLOT_IDS.entries()) {
      const s = slots.current[id];
      const group = groups.current[id];
      const inner = extrude.current[id];
      if (!group || !inner) continue;
      if (!s.el?.isConnected) s.el = logoSlotElement(id);
      const el = s.el;
      const domState = el?.dataset.logoState;

      if (reduced) {
        s.target = ecoShown ? 1 : 0;
        s.value = s.target;
        s.velocity = 0;
      } else {
        s.target = domState === 'sketched' || domState === 'extruded' ? 1 : 0;
        springStep(s, delta);
        if (s.value !== s.target) invalidate();
      }
      if (el && s.target === 1 && s.value >= LOGO.handoff && domState !== 'extruded') markLogoExtruded(id);
      if (el && reduced && s.target === 0 && domState === 'extruded') resetLogo(id);

      if (!el || s.value <= 0.002) {
        group.visible = false;
        continue;
      }
      const r = el.getBoundingClientRect();
      // past its dive the ecosystem stage is hidden (opacity 0, Chapter.tsx) while still in view: hide the logos too
      const stageHidden = el.closest<HTMLElement>('[data-chapter-stage]')?.style.opacity === '0';
      if (stageHidden || r.bottom < 0 || r.top > size.height || r.width === 0) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      const cx = ((r.left + r.width / 2) / size.width) * 2 - 1;
      const cy = -(((r.top + r.height / 2) / size.height) * 2 - 1);
      v.set(cx, cy, 0.5).unproject(camera).sub(camera.position).normalize();
      const dist = LOGO.depth / Math.max(v.dot(fwd), 1e-3);
      group.position.copy(camera.position).addScaledVector(v, dist);
      const sz = Math.min(r.width, r.height) * LOGO.fill * worldPerPx;
      // face the camera, then sway / tilt in the logo's own frame
      const sway = reduced ? 0 : Math.sin(time * LOGO.sway.speed + i * 2.1) * LOGO.sway.amp;
      const tiltX = LOGO.rest.x + (reduced ? 0 : pt.sy * LOGO.tilt);
      const tiltY = LOGO.rest.y + (reduced ? 0 : pt.sx * LOGO.tilt);
      group.quaternion.copy(camera.quaternion).multiply(q.setFromEuler(e.set(tiltX, sway + tiltY, 0)));
      group.scale.setScalar(sz);
      inner.scale.set(1, 1, Math.max(s.value, 0.001));
    }
  });

  return (
    <>
      {LOGO_SLOT_IDS.map((id) => (
        <group
          key={id}
          ref={(g) => {
            groups.current[id] = g;
          }}
          visible={false}
        >
          <group
            ref={(g) => {
              extrude.current[id] = g;
            }}
          >
            {parts[id].map((p, k) => (
              <mesh
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed parts, never reordered
                key={k}
                geometry={p.geometry}
                material={[p.tone === 'accent' ? mats.accent : mats.primary, mats.side]}
              />
            ))}
          </group>
        </group>
      ))}
    </>
  );
}
