import { useEffect, useLayoutEffect, useRef } from 'react';

const SELECTOR = '[data-sidebar-flip]';

/** The sidebar's own running translate transition: its duration (already shortened when it reverses) and easing. */
function panelTiming(): { duration: number; easing: string } | null {
  const panel = document.getElementById('app-sidebar');
  if (!panel || typeof panel.getAnimations !== 'function') return null;
  for (const anim of panel.getAnimations()) {
    if ('transitionProperty' in anim && anim.transitionProperty === 'translate') {
      const timing = anim.effect?.getTiming();
      const duration = Number(timing?.duration);
      if (Number.isFinite(duration) && duration > 0) return { duration, easing: timing?.easing ?? 'linear' };
    }
  }
  return null;
}

/**
 * FLIP for content that sits beside the sidebar ([data-sidebar-flip]). The offset (--sidebar-w) commits in one
 * layout on toggle; each marked element then starts from where it was drawn and slides to its new box on the
 * compositor, with the panel's own duration and easing. No transition on the panel (reduced motion) → no FLIP.
 * Returns `capture`, to call right before the toggle commits.
 */
export function useSidebarFlip(collapsed: boolean): () => void {
  const first = useRef<{ from: boolean; lefts: Map<HTMLElement, number> } | null>(null);
  const running = useRef(new Map<HTMLElement, Animation>());

  useLayoutEffect(() => {
    const before = first.current;
    first.current = null;
    if (!before || before.from === collapsed) return;
    for (const anim of running.current.values()) anim.cancel();
    running.current.clear();
    const timing = panelTiming();
    if (!timing) return;
    for (const [el, x] of before.lefts) {
      if (!el.isConnected || typeof el.animate !== 'function') continue;
      const dx = x - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) continue;
      const anim = el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], timing);
      running.current.set(el, anim);
      anim.onfinish = () => {
        if (running.current.get(el) === anim) running.current.delete(el);
      };
    }
  }, [collapsed]);

  useEffect(() => {
    const map = running.current;
    return () => {
      for (const anim of map.values()) anim.cancel();
      map.clear();
    };
  }, []);

  return () => {
    const lefts = new Map<HTMLElement, number>();
    for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      lefts.set(el, el.getBoundingClientRect().left);
    }
    first.current = { from: collapsed, lefts };
  };
}
