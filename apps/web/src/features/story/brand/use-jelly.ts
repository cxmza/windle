import { type RefCallback, useCallback, useEffect, useRef } from 'react';
import { setDragCursor } from '@/lib/drag-gesture';
import { DRAG_GESTURE, JELLY } from '@/lib/motion-tokens';
import { REDUCED_MOTION_QUERY } from '@/lib/use-media-query';
import {
  advanceSpring,
  atRestSpring,
  clampDt,
  classicKeyframes,
  dragOffset,
  dragTransform,
  isAtRest,
  MARK_BOX,
  type Spring2D,
} from './jelly';

// Logo jelly (character): "Классика" squash on hover-intent / click, "Перетяни" drag-to-stretch with a spring back.
// Two writers, two elements, no conflict: the drag spring transforms the <svg> (origin = centre), the classic is a
// WAAPI animation on its <path> (origin = bottom centre, as in the prototype). One shared rAF loop runs only while a
// mark is held or springing; per-frame values never touch React state. Reduced motion: nothing moves, links work.

interface Sim {
  mark: SVGElement;
  part: Element;
  s: Spring2D;
  held: boolean;
  /** Rendered mark edge, CSS px (measured at rest so a stretched mark does not skew the units). */
  size: number;
  classic: Animation | null;
}

const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;

const registry = new WeakMap<Element, Sim>();
const running = new Set<Sim>();
let raf = 0;
let last = 0;

function render(sim: Sim) {
  if (!sim.held && isAtRest(sim.s)) {
    sim.s = atRestSpring();
    sim.mark.style.transform = '';
    sim.mark.style.willChange = '';
    return;
  }
  sim.mark.style.transform = dragTransform(sim.s, sim.size);
}

function tick(now: number) {
  const dt = clampDt(now - last);
  last = now;
  for (const sim of running) {
    if (!sim.held) advanceSpring(sim.s, dt);
    render(sim);
    if (!sim.held && isAtRest(sim.s)) running.delete(sim);
  }
  raf = running.size ? requestAnimationFrame(tick) : 0;
}

function wake(sim: Sim) {
  running.add(sim);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

/** Plays the classic squash on a bound mark. False when skipped (reduced motion, dragging, already wobbling). */
export function playClassic(mark: Element, amp = 1): boolean {
  const sim = registry.get(mark);
  if (!sim || reduced() || typeof sim.part.animate !== 'function') return false;
  if (sim.held || running.has(sim) || sim.classic) return false;
  const anim = sim.part.animate(classicKeyframes(amp), { duration: JELLY.classicMs });
  sim.classic = anim;
  const done = () => {
    if (sim.classic === anim) sim.classic = null;
  };
  anim.addEventListener('finish', done);
  anim.addEventListener('cancel', done);
  return true;
}

const isMouse = (e: Event) =>
  typeof PointerEvent !== 'undefined' && e instanceof PointerEvent && e.pointerType === 'mouse';

interface Gesture {
  id: number;
  touch: boolean;
  x0: number;
  y0: number;
  /** Pointer position that maps to zero displacement once dragging. */
  ox: number;
  oy: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
  hold: number;
}

/** Wires one [data-logo-jelly] mark; returns the cleanup. The hover/click target is the enclosing link or button. */
export function bindJelly(mark: SVGElement): () => void {
  const handle: HTMLElement | SVGElement = mark.closest<HTMLElement>('a, button') ?? mark;
  const part = mark.querySelector('path') ?? mark;
  const sim: Sim = { mark, part, s: atRestSpring(), held: false, size: 0, classic: null };
  registry.set(mark, sim);
  if (part instanceof SVGElement) {
    part.style.transformBox = 'fill-box';
    part.style.transformOrigin = '50% 100%';
  }

  let g: Gesture | null = null;
  /** Set by the pointerup that ends a real drag; consumed by the click it produces (and nothing later). */
  let swallowClick = false;
  let swallowReset = 0;
  let hoverTimer = 0;
  let hoverArmed = true;

  const measure = () => {
    if (!running.has(sim)) sim.size = mark.getBoundingClientRect().width || sim.size;
  };

  const startDrag = (gesture: Gesture) => {
    gesture.dragging = true;
    window.clearTimeout(hoverTimer);
    // continue from the current displacement if the mark is still springing (grab it mid-flight)
    const unitsPerPx = sim.size > 0 ? (MARK_BOX / sim.size) * JELLY.follow : 1;
    gesture.ox = gesture.x0 - sim.s.x / unitsPerPx;
    gesture.oy = gesture.y0 - sim.s.y / unitsPerPx;
    sim.held = true;
    sim.s.vx = 0;
    sim.s.vy = 0;
    mark.style.willChange = 'transform';
    mark.toggleAttribute('data-jelly-dragging', true);
    setDragCursor('grabbing'); // the pencil layer steps aside while a mark owns the pointer
    try {
      mark.setPointerCapture(gesture.id);
    } catch {
      // pointer already gone; the release path still runs on pointerup/cancel
    }
    follow(gesture, gesture.lastX, gesture.lastY);
  };

  const follow = (gesture: Gesture, x: number, y: number) => {
    const off = dragOffset(x - gesture.ox, y - gesture.oy, sim.size);
    sim.s.x = off.x;
    sim.s.y = off.y;
    wake(sim);
  };

  const end = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    window.clearTimeout(g.hold);
    if (g.dragging) {
      sim.held = false;
      mark.toggleAttribute('data-jelly-dragging', false);
      setDragCursor('');
      wake(sim);
      // the click this pointerup produces must not navigate. It is dispatched right after pointerup, before any
      // timer; if none comes (released outside the link), the flag is dropped on the next task, so a later click
      // (pointer or keyboard) is never eaten.
      if (e.type === 'pointerup') {
        swallowClick = true;
        window.clearTimeout(swallowReset);
        swallowReset = window.setTimeout(() => {
          swallowClick = false;
        }, 0);
      }
    }
    g = null;
  };

  const onDown = (e: PointerEvent) => {
    if (reduced() || g || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swallowClick = false;
    measure();
    const gesture: Gesture = {
      id: e.pointerId,
      touch: e.pointerType === 'touch',
      x0: e.clientX,
      y0: e.clientY,
      ox: e.clientX,
      oy: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      dragging: false,
      hold: 0,
    };
    // touch: a still finger for touchHoldMs claims the drag; moving first means scroll (the browser takes it)
    if (gesture.touch) {
      gesture.hold = window.setTimeout(() => {
        if (g === gesture && !gesture.dragging) startDrag(gesture);
      }, DRAG_GESTURE.touchHoldMs);
    }
    // mouse/pen: capture now, so the slop can be crossed outside a 24px mark
    if (!gesture.touch) {
      try {
        mark.setPointerCapture(e.pointerId);
      } catch {
        // ignore: synthetic or already released pointer
      }
    }
    g = gesture;
  };

  const onMove = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    if (g.dragging) {
      follow(g, e.clientX, e.clientY);
      return;
    }
    if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) <= DRAG_GESTURE.slopPx) return;
    if (g.touch) {
      window.clearTimeout(g.hold);
      g = null; // a scroll, not a drag
    } else {
      startDrag(g);
    }
  };

  // once the drag owns the finger, keep the page from scrolling (needs a non-passive listener)
  const onTouchMove = (e: TouchEvent) => {
    if (g?.dragging && e.cancelable) e.preventDefault();
  };
  const onContextMenu = (e: Event) => {
    if (g) e.preventDefault(); // long-press menu on touch
  };
  const onDragStart = (e: Event) => {
    if (!reduced()) e.preventDefault(); // native link drag would steal the gesture
  };

  const onClick = (e: Event) => {
    if (swallowClick) {
      swallowClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    playClassic(mark);
  };

  // hover intent: a dwell filters fly-overs; one play per visit (re-arms on leave)
  const onEnter = (e: Event) => {
    if (!isMouse(e) || !hoverArmed) return;
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      if (playClassic(mark)) hoverArmed = false;
    }, JELLY.hoverIntentMs);
  };
  const onLeave = (e: Event) => {
    if (!isMouse(e)) return;
    window.clearTimeout(hoverTimer);
    hoverArmed = true;
  };

  mark.addEventListener('pointerdown', onDown);
  mark.addEventListener('pointermove', onMove);
  mark.addEventListener('pointerup', end);
  mark.addEventListener('pointercancel', end);
  mark.addEventListener('lostpointercapture', end);
  mark.addEventListener('touchmove', onTouchMove, { passive: false });
  mark.addEventListener('contextmenu', onContextMenu);
  handle.addEventListener('dragstart', onDragStart);
  handle.addEventListener('click', onClick, { capture: true });
  handle.addEventListener('pointerenter', onEnter);
  handle.addEventListener('pointerleave', onLeave);

  return () => {
    mark.removeEventListener('pointerdown', onDown);
    mark.removeEventListener('pointermove', onMove);
    mark.removeEventListener('pointerup', end);
    mark.removeEventListener('pointercancel', end);
    mark.removeEventListener('lostpointercapture', end);
    mark.removeEventListener('touchmove', onTouchMove);
    mark.removeEventListener('contextmenu', onContextMenu);
    handle.removeEventListener('dragstart', onDragStart);
    handle.removeEventListener('click', onClick, { capture: true });
    handle.removeEventListener('pointerenter', onEnter);
    handle.removeEventListener('pointerleave', onLeave);
    window.clearTimeout(hoverTimer);
    window.clearTimeout(swallowReset);
    if (g) window.clearTimeout(g.hold);
    if (g?.dragging) setDragCursor('');
    sim.classic?.cancel();
    running.delete(sim);
    registry.delete(mark);
    mark.style.transform = '';
    mark.style.willChange = '';
    mark.removeAttribute('data-jelly-dragging');
  };
}

/**
 * Ref for a container (the logo link, the dock home button): binds every `[data-logo-jelly]` mark inside it, or the
 * node itself. When `nudgeKey` changes after mount (e.g. the active chapter), the marks do a small classic.
 */
export function useLogoJelly<T extends Element>(nudgeKey?: unknown): RefCallback<T> {
  const marks = useRef<SVGElement[]>([]);
  const ref = useCallback<RefCallback<T>>((node) => {
    if (!node) return;
    const found = [
      ...(node.matches('[data-logo-jelly]') ? [node] : []),
      ...node.querySelectorAll('[data-logo-jelly]'),
    ].filter((el): el is SVGElement => el instanceof SVGElement);
    marks.current = found;
    const cleanups = found.map(bindJelly);
    return () => {
      for (const cleanup of cleanups) cleanup();
      marks.current = [];
    };
  }, []);

  // compare with the last seen key (not a "first run" flag): StrictMode re-runs effects on mount
  const seen = useRef(nudgeKey);
  useEffect(() => {
    if (Object.is(seen.current, nudgeKey)) return;
    seen.current = nudgeKey;
    for (const mark of marks.current) playClassic(mark, JELLY.nudgeAmp);
  }, [nudgeKey]);

  return ref;
}
