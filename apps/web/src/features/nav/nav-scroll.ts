import { useLayoutEffect, useRef } from 'react';

/** Pure: 0..1 share of the page scrolled. */
export function scrollProgress(scrollY: number, maxScroll: number): number {
  if (!(maxScroll > 0)) return 0;
  return Math.min(1, Math.max(0, scrollY / maxScroll));
}

/**
 * Scroll progress for the bar's fill. Where scroll-driven animations exist the fill is scrubbed by CSS
 * (`animation-timeline: scroll(root)`, globals.css) and this hook does nothing. Otherwise it writes `--dock-progress`
 * (0..1) on the fill element itself, never on an ancestor (a per-frame custom property on a parent restyles its subtree).
 */
export function useScrollProgressVar<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')) return;
    let last = '';
    const write = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const value = scrollProgress(window.scrollY, max).toFixed(4);
      if (value === last) return;
      last = value;
      el.style.setProperty('--dock-progress', value);
    };
    write();
    window.addEventListener('scroll', write, { passive: true });
    window.addEventListener('resize', write);
    return () => {
      window.removeEventListener('scroll', write);
      window.removeEventListener('resize', write);
    };
  }, []);
  return ref;
}
