import { getStroke } from 'perfect-freehand';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dragCursorActive } from '@/lib/drag-gesture';
import { EXIT_SPEED, HAND } from '@/lib/motion-tokens';
import { REDUCED_MOTION_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { drawOn } from './hand/draw-on';
import { outlineToPath } from './hand/freehand';
import { HandDrawing } from './hand/HandDrawing';
import { outlineDrawing } from './hand/strokes';
import type { DrawingDef } from './hand/types';

/** Devices with a real hovering pointer; touch and coarse pointers never get the overlay. */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** Gap between a CTA and its sketched outline, px (outlineDrawing's own pad). */
const SKETCH_PAD = 6;
/** Hover sketch plays faster than a margin note: it answers a pointer, it must not lag behind it. */
const SKETCH_SPEED = 1.6;
/** Trail nib in px, and the minimum pointer travel worth a new sample. */
const TRAIL_SIZE = 3.5;
const MIN_STEP = 1.5;
const TIP_RADIUS = 4;

const TRAIL_OPTIONS = {
  size: TRAIL_SIZE,
  thinning: 0.7,
  smoothing: 0.5,
  streamline: 0.4,
  simulatePressure: false,
  last: false,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
} as const;

type Sketch = { key: number; x: number; y: number; drawing: DrawingDef };

/** The target's own corner radius in px (top-left; a pill's 9999px is clamped later by the outline). */
function cornerRadius(el: Element, rect: { width: number; height: number }): number {
  const raw = getComputedStyle(el).borderTopLeftRadius.split(' ')[0] ?? '';
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return raw.endsWith('%') ? (value / 100) * Math.min(rect.width, rect.height) : value;
}

/**
 * Pencil cursor (character, plus hover feedback on CTAs).
 *
 * Renders nothing on touch/coarse pointers and under reduced motion. Otherwise a fixed, click-through,
 * aria-hidden layer with:
 *   [data-pencil-trail]   the trail: a perfect-freehand stroke through the last ~400ms of pointer samples, thinner
 *                         and shorter as samples age out
 *   [data-pencil-sketch]  the hand-drawn outline around a hovered `[data-sketch-target]` (outlineDrawing), drawn on
 *                         on enter and undrawn on leave / scroll
 *   [data-pencil-tip]     the nib that follows the pointer
 * While a mark owns the pointer (grab affordance or drag, lib/drag-gesture.ts) the layer steps aside: trail and nib
 * clear, so the system grab/grabbing cursor is the only pointer on screen.
 */
export function PencilCursor() {
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  if (!finePointer || reducedMotion) return null;
  return <PencilLayer />;
}

function PencilLayer() {
  const trailRef = useRef<SVGPathElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const sketchRef = useRef<SVGGElement>(null);
  const sketchTlRef = useRef<gsap.core.Timeline | null>(null);
  const [sketch, setSketch] = useState<Sketch | null>(null);

  // Trail + hover detection. Pointer events only record samples; one rAF per frame renders them, and the loop stops
  // once the trail has aged out (idle = no frames). Sample storage is preallocated; per frame only perfect-freehand's
  // own output and the path string are allocated.
  useEffect(() => {
    const trail = trailRef.current;
    const tip = tipRef.current;
    if (!trail || !tip) return;

    const cap = HAND.trailPoints;
    const xs = new Float64Array(cap);
    const ys = new Float64Array(cap);
    const ts = new Float64Array(cap);
    const pool: number[][] = Array.from({ length: cap }, () => [0, 0, 0]);
    const input: number[][] = [];
    let start = 0; // ring buffer: oldest sample index
    let count = 0;
    let raf = 0;
    let lastX = 0;
    let lastY = 0;

    const frame = () => {
      raf = 0;
      // same clock as the samples (the rAF timestamp is the frame start and can trail the event times)
      const now = performance.now();
      while (count > 0 && now - (ts[start] ?? 0) > HAND.trailMs) {
        start = (start + 1) % cap;
        count--;
      }
      tip.style.transform = `translate3d(${lastX - TIP_RADIUS}px, ${lastY - TIP_RADIUS}px, 0)`;
      if (count < 2) {
        trail.setAttribute('d', '');
        return; // idle: no new frame until the pointer moves again
      }
      input.length = 0;
      for (let i = 0; i < count; i++) {
        const k = (start + i) % cap;
        const p = pool[i];
        if (!p) continue;
        p[0] = xs[k] ?? 0;
        p[1] = ys[k] ?? 0;
        p[2] = 1 - (now - (ts[k] ?? now)) / HAND.trailMs; // older = lighter = thinner
        input.push(p);
      }
      trail.setAttribute('d', outlineToPath(getStroke(input, TRAIL_OPTIONS)));
      raf = requestAnimationFrame(frame);
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(frame);
    };

    let hovered: Element | null = null;
    let sketchKey = 0;
    const enter = (el: Element) => {
      const r = el.getBoundingClientRect();
      sketchKey += 1;
      setSketch({
        key: sketchKey,
        x: r.left - SKETCH_PAD,
        y: r.top - SKETCH_PAD,
        drawing: outlineDrawing(r.width, r.height, SKETCH_PAD, cornerRadius(el, r)),
      });
    };
    const leave = () => {
      const tl = sketchTlRef.current;
      const key = sketchKey;
      const clear = () => setSketch((s) => (s?.key === key ? null : s));
      if (!tl) {
        clear();
        return;
      }
      tl.eventCallback('onReverseComplete', clear);
      tl.timeScale(SKETCH_SPEED * EXIT_SPEED).reverse();
    };
    const setHovered = (el: Element | null) => {
      if (el === hovered) return;
      if (hovered) leave();
      hovered = el;
      if (el) enter(el);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (dragCursorActive()) {
        tip.style.opacity = '0';
        setHovered(null);
        count = 0; // the next frame clears the trail and the loop idles
        schedule();
        return;
      }
      tip.style.opacity = '1';
      const target = e.target instanceof Element ? e.target.closest('[data-sketch-target]') : null;
      setHovered(target?.getAttribute('aria-disabled') === 'true' ? null : target);
      if (count > 0 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < MIN_STEP) return;
      lastX = e.clientX;
      lastY = e.clientY;
      const k = (start + count) % cap;
      xs[k] = lastX;
      ys[k] = lastY;
      ts[k] = performance.now();
      if (count < cap) count++;
      else start = (start + 1) % cap;
      schedule();
    };
    const onLeaveWindow = () => {
      tip.style.opacity = '0';
      setHovered(null);
    };
    // the outline is drawn in viewport space: when the page moves under it, take it away instead of chasing it
    const onScroll = () => setHovered(null);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeaveWindow);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeaveWindow);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, []);

  // CTA sketch: draw the fresh outline on (before first paint, so it never flashes finished).
  useLayoutEffect(() => {
    const g = sketchRef.current;
    if (!sketch || !g) return;
    const tl = drawOn([g], { hand: false });
    tl.timeScale(SKETCH_SPEED).play();
    sketchTlRef.current = tl;
    return () => {
      tl.kill();
      if (sketchTlRef.current === tl) sketchTlRef.current = null;
    };
  }, [sketch]);

  return (
    <div
      aria-hidden="true"
      data-pencil-cursor
      className="pointer-events-none fixed inset-0 z-(--z-pencil) text-ink select-none"
    >
      <svg aria-hidden="true" focusable="false" className="size-full overflow-visible">
        <g ref={sketchRef} data-pencil-sketch>
          {sketch && (
            <HandDrawing
              key={sketch.key}
              id={`pencil-sketch-${sketch.key}`}
              drawing={sketch.drawing}
              x={sketch.x}
              y={sketch.y}
              width={sketch.drawing.viewBox.w}
              height={sketch.drawing.viewBox.h}
            />
          )}
        </g>
        <g data-pencil-trail>
          <path ref={trailRef} fill="currentColor" />
        </g>
      </svg>
      <span data-pencil-tip ref={tipRef} className="absolute top-0 left-0 size-2 rounded-pill bg-ink opacity-0" />
    </div>
  );
}
