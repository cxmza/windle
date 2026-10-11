import { type RefObject, useLayoutEffect, useRef } from 'react';
import { REDUCED_MOTION_QUERY } from '@/lib/use-media-query';

/** Scroll offset (px) past which the full pill collapses to the compact one. */
export const COLLAPSE_AFTER = 80;
/** The compact pill hides once the reader is this far down and keeps scrolling down. */
export const HIDE_AFTER = 400;
/** Downward travel (px) from the last turning point before the bar hides / upward travel before it returns. */
export const HIDE_TRAVEL = 16;
export const SHOW_TRAVEL = 8;
/** A single scroll step this long (px, downward, past COLLAPSE_AFTER) hides the bar at once (a fling). */
export const FAST_SCROLL = 360;

export type NavMode = 'full' | 'compact' | 'hidden';

export interface NavScrollState {
  y: number;
  /** Scroll offset where the current direction started. */
  anchor: number;
  dir: -1 | 0 | 1;
  hidden: boolean;
}

export const NAV_SCROLL_START: NavScrollState = { y: 0, anchor: 0, dir: 0, hidden: false };

/** Pure: next hide/reveal state for a new scroll offset. `canHide` false (reduced motion, open menu, focus inside) pins it visible. */
export function stepNavScroll(prev: NavScrollState, y: number, canHide: boolean): NavScrollState {
  if (!canHide || y <= COLLAPSE_AFTER) return { y, anchor: y, dir: 0, hidden: false };
  const dir = y > prev.y ? 1 : y < prev.y ? -1 : prev.dir;
  const anchor = dir !== prev.dir ? prev.y : prev.anchor;
  let hidden = prev.hidden;
  if (dir === 1 && ((y > HIDE_AFTER && y - anchor > HIDE_TRAVEL) || y - prev.y >= FAST_SCROLL)) hidden = true;
  if (dir === -1 && anchor - y > SHOW_TRAVEL) hidden = false;
  return { y, anchor, dir, hidden };
}

/** Pure: what the bar shows. `expand` = hover, keyboard focus inside or an open menu: always the full pill. */
export function navMode(state: NavScrollState, expand: boolean): NavMode {
  if (state.hidden && !expand) return 'hidden';
  return expand || state.y <= COLLAPSE_AFTER ? 'full' : 'compact';
}

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

/** Keyboard focus inside `el` (a link merely clicked with the mouse must not pin the bar). */
function hasKeyboardFocus(el: HTMLElement): boolean {
  try {
    return el.querySelector(':focus-visible') !== null;
  } catch {
    return el.matches(':focus-within'); // engines without :focus-visible
  }
}

/**
 * Drives the bar through one attribute on `root` (no React state, no re-render per scroll event):
 * `data-nav-state="full|compact|hidden"`. Full at the top, compact once scrolled, hidden while scrolling further down,
 * back to compact on any scroll up. Hover, keyboard focus and an open menu pin it full. Reduced motion: never hidden.
 */
export function useNavScroll(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
    const menuOpen = () => el.querySelector('[data-state="open"]') !== null;
    let state: NavScrollState = { ...NAV_SCROLL_START, y: window.scrollY, anchor: window.scrollY };
    let hovered = false;
    const apply = () => {
      const mode = navMode(state, hovered || hasKeyboardFocus(el) || menuOpen());
      if (el.getAttribute('data-nav-state') !== mode) el.setAttribute('data-nav-state', mode);
    };
    const onScroll = () => {
      const pinned = reduced() || hasKeyboardFocus(el) || menuOpen();
      state = stepNavScroll(state, window.scrollY, !pinned);
      apply();
    };
    const onFocusIn = () => {
      state = { ...state, hidden: false, anchor: state.y, dir: 0 };
      apply();
    };
    const onEnter = () => {
      hovered = true;
      apply();
    };
    const onLeave = () => {
      hovered = false;
      apply();
    };
    const pill = el.querySelector('[data-dock]') ?? el;
    const afterFocus = () => requestAnimationFrame(apply); // focus has moved on by the next frame
    const observer = new MutationObserver(apply); // a menu opening / closing changes data-state
    observer.observe(el, { attributes: true, attributeFilter: ['data-state'], subtree: true });
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', afterFocus);
    pill.addEventListener('pointerenter', onEnter);
    pill.addEventListener('pointerleave', onLeave);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', afterFocus);
      pill.removeEventListener('pointerenter', onEnter);
      pill.removeEventListener('pointerleave', onLeave);
    };
  }, [root]);
}
