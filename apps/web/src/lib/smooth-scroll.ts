import { useEffect } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';

type LenisInstance = InstanceType<typeof import('lenis').default>;
let activeLenis: LenisInstance | null = null;

/** Where Lenis never runs: coarse (touch) pointers or narrow viewports. */
export const MOBILE_SCROLL_QUERY = '(pointer: coarse), (max-width: 767px)';

/**
 * Programmatic scroll shared by the router (story-nav.ts): through Lenis while it runs (so its inertia does not fight
 * the move), else native. `immediate` jumps (reduced motion, initial load, back/forward under reduced motion).
 */
export function scrollToY(top: number, immediate: boolean) {
  if (activeLenis) {
    activeLenis.scrollTo(top, { immediate });
    return;
  }
  window.scrollTo({ top, behavior: immediate ? 'auto' : 'smooth' });
}

// Opt-in smooth scroll: call once at the root, and only if the design really needs it —
// it changes how native scrolling feels. Skipped under prefers-reduced-motion.
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Mobile mode (touch-first or narrow): native scroll. Lenis does not smooth touch anyway, but its per-frame raf,
    // lagSmoothing(0) and scroll proxying stay on the main thread while the compositor already does momentum.
    if (window.matchMedia(MOBILE_SCROLL_QUERY).matches) return;
    // Lenis measures with ResizeObserver; without it (old engines, jsdom) keep native scroll.
    if (typeof ResizeObserver === 'undefined') return;

    // Lenis is fetched as its own chunk (not on the first-paint path); the first wheel ticks before it arrives
    // scroll natively.
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis();
      activeLenis = lenis;
      lenis.on('scroll', ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      // One loop: Lenis runs inside GSAP's ticker (no rAF of its own), and FIRST in it (prioritize), so its
      // window.scrollTo and the synchronous ScrollTrigger.update happen before this frame's tweens write styles.
      // Last in the ticker, scrollTo had to flush the style/layout those writes had just dirtied (measured: the
      // largest self-time item of the mobile scroll profile), and a second recalc followed at paint.
      gsap.ticker.add(tick, false, true);
      gsap.ticker.lagSmoothing(0);
      dispose = () => {
        if (activeLenis === lenis) activeLenis = null;
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33); // GSAP default
        lenis.destroy();
      };
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [enabled]);
}
