import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  type Camera,
  type Group,
  type Intersection,
  Mesh,
  Plane,
  type Raycaster,
  Raycaster as RaycasterImpl,
  Vector2,
  Vector3,
} from 'three';
import { setDragCursor } from '@/lib/drag-gesture';
import { DRAG_GESTURE } from '@/lib/motion-tokens';
import { CHAPTERS } from '../chapters';
import { storyScroll } from '../story-scroll';
import {
  type ClassicSample,
  createDragSpring,
  dragOffset,
  dragStretch,
  JellyBank,
  jellyMatrix,
  type Stretch,
  stepDragSpring,
} from './jelly';
import { JELLY, MARK } from './scene-tokens';

const HERO_INDEX = 0;
const CTA_INDEX = CHAPTERS.findIndex((c) => c.id === 'cta');

/**
 * DOM targets that keep their own pointer behaviour even when the mark is behind them: controls, and text (a press on
 * a glyph selects text, the I-beam stays). The mark is grabbed only through empty page.
 */
const OWN_POINTER = [
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable="true"]',
  'h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, [data-caption], [data-chapter-text]',
  '[data-mark-ignore]',
].join(', ');

function ownsPointer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(OWN_POINTER) !== null;
}

type Phase = 'idle' | 'pending' | 'held';

interface DragRuntime {
  phase: Phase;
  pointerId: number;
  pointerType: string;
  start: { x: number; y: number };
  client: { x: number; y: number };
  /** The ray hits the mark AND the DOM target under the pointer is not text or a control. */
  hover: boolean;
  /** Grab point in mark sizes (root-local), set on the first held frame. */
  grab: { x: number; y: number } | null;
  holdTimer: number;
  detach: (() => void) | null;
}

export interface MarkTick {
  camera: Camera;
  delta: number;
  /** Intro tween progress 0..1 (the mark arriving from depth). */
  intro: number;
}

/**
 * Mark interaction ("Классика" jelly + "Перетяни" drag). Group chain the caller renders:
 * root (pose position/scale) > jelly (matrixAutoUpdate false: drag offset + stretch + classic squash) > spin > mesh.
 * The jelly group is not rotated, so squash and stretch stay screen-aligned while the mark turns.
 * Per-frame values live in refs; `tick` is called from the scene's useFrame. Reduced motion: no handlers, no jelly.
 */
export function useMark(reduced: boolean) {
  const root = useRef<Group>(null);
  const jelly = useRef<Group>(null);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  // Mutable simulation state; identity must be stable for the scene's lifetime (not a render concern).
  const sim = useMemo(
    () => ({
      bank: new JellyBank(2),
      spring: createDragSpring(),
      classic: { sx: 1, sy: 1, skew: 0 } as ClassicSample,
      stretch: { angle: 0, along: 1, across: 1 } as Stretch,
      offset: { x: 0, y: 0 },
      landed: false,
      lastActive: storyScroll.active,
      identity: true,
      ray: new RaycasterImpl(),
      ndc: new Vector2(),
      plane: new Plane(),
      hit: new Vector3(),
      tmp: new Vector3(),
      dir: new Vector3(),
    }),
    [],
  );
  const rt = useRef<DragRuntime>({
    phase: 'idle',
    pointerId: -1,
    pointerType: '',
    start: { x: 0, y: 0 },
    client: { x: 0, y: 0 },
    hover: false,
    grab: null,
    holdTimer: 0,
    detach: null,
  });

  const api = useMemo(() => {
    const end = () => {
      const r = rt.current;
      window.clearTimeout(r.holdTimer);
      r.detach?.();
      r.detach = null;
      r.phase = 'idle';
      r.grab = null;
      sim.spring.held = false;
      setDragCursor(r.hover && !reducedRef.current ? 'grab' : '');
    };

    const beginHold = () => {
      const r = rt.current;
      r.phase = 'held';
      r.grab = null;
      sim.spring.held = true;
      sim.spring.vx = 0;
      sim.spring.vy = 0;
      setDragCursor('grabbing');
      window.getSelection()?.removeAllRanges();
    };

    const attach = () => {
      const r = rt.current;
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== r.pointerId) return;
        r.client.x = ev.clientX;
        r.client.y = ev.clientY;
        const moved = Math.hypot(ev.clientX - r.start.x, ev.clientY - r.start.y);
        if (r.phase === 'pending' && moved > DRAG_GESTURE.slopPx) {
          // touch: moving before the hold elapsed is a scroll; mouse/pen: past the slop a press becomes a drag
          if (r.pointerType === 'touch') end();
          else beginHold();
        } else if (r.phase === 'held' && r.pointerType !== 'touch') window.getSelection()?.removeAllRanges();
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== r.pointerId) return;
        const tap = Math.hypot(ev.clientX - r.start.x, ev.clientY - r.start.y) <= DRAG_GESTURE.slopPx;
        end();
        if (tap) sim.bank.trigger(JELLY.amp.tap);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === r.pointerId) end();
      };
      // only a confirmed drag blocks scrolling; this listener exists only between press and release on the mark
      const onTouchMove = (ev: TouchEvent) => {
        if (r.phase === 'held' && ev.cancelable) ev.preventDefault();
      };
      // a mouse press on the mark (never on text: see OWN_POINTER) must not start a selection elsewhere while it
      // decides between click and drag
      const onSelectStart = (ev: Event) => {
        if (r.phase === 'held' || r.pointerType !== 'touch') ev.preventDefault();
      };
      const onContextMenu = (ev: Event) => {
        if (r.phase !== 'idle') ev.preventDefault();
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('selectstart', onSelectStart, true);
      window.addEventListener('contextmenu', onContextMenu, true);
      r.detach = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('selectstart', onSelectStart, true);
        window.removeEventListener('contextmenu', onContextMenu, true);
      };
    };

    const grabbable = () => {
      const g = root.current;
      return !!g && g.visible && g.scale.x >= JELLY.minScale;
    };

    const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
      const ne = e.nativeEvent;
      const r = rt.current;
      if (reducedRef.current || r.phase !== 'idle' || !ne.isPrimary) return;
      if (ne.pointerType === 'mouse' && ne.button !== 0) return;
      if (ownsPointer(ne.target) || !grabbable()) return;
      e.stopPropagation();
      r.pointerId = ne.pointerId;
      r.pointerType = ne.pointerType;
      r.start.x = r.client.x = ne.clientX;
      r.start.y = r.client.y = ne.clientY;
      attach();
      // same rule as the 2D marks (DRAG_GESTURE): mouse/pen drag after the slop, touch after a still hold
      r.phase = 'pending';
      if (ne.pointerType === 'touch') {
        r.holdTimer = window.setTimeout(() => {
          if (rt.current.phase === 'pending') beginHold();
        }, DRAG_GESTURE.touchHoldMs);
      }
    };

    // grab affordance only where a press would actually grab: over the mark, not over text or a control
    const syncHover = (target: EventTarget | null, over: boolean) => {
      const r = rt.current;
      r.hover = over && !ownsPointer(target) && grabbable();
      if (r.phase === 'idle' && !reducedRef.current) setDragCursor(r.hover ? 'grab' : '');
    };
    const onPointerOver = (e: ThreeEvent<PointerEvent>) => syncHover(e.nativeEvent.target, true);
    const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
      if (e.nativeEvent.pointerType !== 'touch') syncHover(e.nativeEvent.target, true);
    };
    const onPointerOut = () => syncHover(null, false);

    /** Hidden or mid-handoff marks are not hit-testable (and cost no triangle tests). */
    function raycast(this: Mesh, raycaster: Raycaster, hits: Intersection[]) {
      if (!grabbable()) return;
      Mesh.prototype.raycast.call(this, raycaster, hits);
    }

    return { end, handlers: { onPointerDown, onPointerOver, onPointerMove, onPointerOut }, raycast };
  }, [sim]);

  // Leaving reduced motion mid-drag, or unmounting: drop listeners, restore the cursor, settle to identity.
  useEffect(() => {
    if (reduced) {
      api.end();
      sim.bank.reset();
      sim.spring.x = sim.spring.y = sim.spring.vx = sim.spring.vy = 0;
    }
    return () => api.end();
  }, [reduced, api, sim]);

  const tick = ({ camera, delta, intro }: MarkTick) => {
    const g = root.current;
    const j = jelly.current;
    if (!g || !j) return;
    if (reducedRef.current) {
      if (!sim.identity) {
        j.matrix.identity();
        j.matrixWorldNeedsUpdate = true;
        sim.identity = true;
      }
      return;
    }

    // triggers: landing on load, hero re-entry (subtle), CTA reassembly
    if (!sim.landed && intro >= JELLY.landAt) {
      sim.landed = true;
      sim.bank.trigger(JELLY.amp.land);
    }
    const active = storyScroll.active;
    if (active !== sim.lastActive) {
      if (active === HERO_INDEX && sim.landed) sim.bank.trigger(JELLY.amp.reenter);
      else if (active === CTA_INDEX) sim.bank.trigger(JELLY.amp.cta);
      sim.lastActive = active;
    }
    sim.bank.step(delta);

    const r = rt.current;
    const spring = sim.spring;
    if (r.phase === 'held' && g.scale.x < JELLY.minScale) api.end();
    if (r.phase === 'held') {
      // pointer -> plane through the mark facing the camera -> root-local, in mark sizes
      sim.ndc.set((r.client.x / window.innerWidth) * 2 - 1, -(r.client.y / window.innerHeight) * 2 + 1);
      sim.ray.setFromCamera(sim.ndc, camera);
      camera.getWorldDirection(sim.dir);
      g.getWorldPosition(sim.tmp);
      sim.plane.setFromNormalAndCoplanarPoint(sim.dir, sim.tmp);
      if (sim.ray.ray.intersectPlane(sim.plane, sim.hit)) {
        g.worldToLocal(sim.hit);
        const px = sim.hit.x / MARK.size;
        const py = sim.hit.y / MARK.size;
        // re-grab mid-flight keeps the current offset (no jump)
        r.grab ??= { x: px - spring.x / JELLY.drag.follow, y: py - spring.y / JELLY.drag.follow };
        dragOffset(px - r.grab.x, py - r.grab.y, sim.offset);
        spring.x = sim.offset.x;
        spring.y = sim.offset.y;
      }
    } else {
      stepDragSpring(spring, delta);
    }

    const resting = !sim.bank.active && spring.x === 0 && spring.y === 0 && !spring.held;
    if (resting && sim.identity) return;
    dragStretch(spring.x, spring.y, sim.stretch);
    sim.bank.sample(sim.classic);
    jellyMatrix(j.matrix.elements, {
      ox: spring.x * MARK.size,
      oy: spring.y * MARK.size,
      stretch: sim.stretch,
      classic: sim.classic,
      pivotY: -MARK.size / 2,
    });
    j.matrixWorldNeedsUpdate = true;
    sim.identity = resting;
  };

  return {
    root,
    jelly,
    tick,
    raycast: api.raycast,
    handlers: reduced ? undefined : api.handlers,
  };
}
