import type { BufferGeometry } from 'three';
import { createHalfGeometry, createPortalGeometry, createRingGeometry, createSlabGeometry } from './geometry';
import { createLogoParts } from './logo-geometry';
import { createMarkGeometry } from './mark-geometry';

/**
 * CPU-side scene resources built ahead of the Canvas mount, one per idle period.
 *
 * Measured (mobile-4x, cold): the scene's first R3F render built every extruded/rounded geometry inside the mount
 * task (mark ~100 ms, logos ~65 ms, rounded boxes + tori ~90 ms) on top of the WebGL context creation. StoryCanvas now
 * runs `prepare()` for each in its own idle slot after the 3D chunk arrives; the component's useMemo `take()`s the
 * prepared value (or builds it on the spot when nothing was prepared — first mount without idle callbacks, a tier
 * swap, a remount). A taken value belongs to the taker (it disposes it); `drop()` disposes one that was never taken.
 */
export interface Preparable<T> {
  prepare: () => void;
  take: () => T;
  drop: () => void;
}

export function preparable<T>(build: () => T, dispose: (value: T) => void): Preparable<T> {
  let slot: { value: T } | null = null;
  return {
    prepare() {
      slot ??= { value: build() };
    },
    take() {
      const ready = slot;
      slot = null;
      return ready ? ready.value : build();
    },
    drop() {
      if (slot) dispose(slot.value);
      slot = null;
    },
  };
}

type Tier = 'high' | 'low';

const disposeGeometry = (g: BufferGeometry) => g.dispose();

/** The scene's own geometries (StoryScene Rig, Logos), taken by their useMemo. */
export const PREPARED = {
  mark: {
    high: preparable(() => createMarkGeometry('high'), disposeGeometry),
    low: preparable(() => createMarkGeometry('low'), disposeGeometry),
  } satisfies Record<Tier, Preparable<BufferGeometry>>,
  half: preparable(createHalfGeometry, disposeGeometry),
  slab: preparable(createSlabGeometry, disposeGeometry),
  ring: preparable(createRingGeometry, disposeGeometry),
  portal: preparable(createPortalGeometry, disposeGeometry),
  logos: preparable(createLogoParts, (parts) => {
    for (const list of Object.values(parts)) for (const p of list) p.geometry.dispose();
  }),
};

/**
 * Idle jobs for StoryCanvas, largest first. The mark is built for the tier the scene will most likely pick (narrow
 * viewport -> low); a software-GL client swaps to low and the unused high mark is dropped on mount.
 */
export function sceneWarmJobs(narrow: boolean): Array<() => void> {
  return [
    PREPARED.mark[narrow ? 'low' : 'high'].prepare,
    PREPARED.logos.prepare,
    PREPARED.half.prepare,
    PREPARED.ring.prepare,
    PREPARED.slab.prepare,
    PREPARED.portal.prepare,
  ];
}
