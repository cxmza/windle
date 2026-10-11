import { REDUCED_MOTION_QUERY } from '@/lib/use-media-query';

/** Below Tailwind's md breakpoint the hand would cover the text it annotates, so it stays away. */
export const HAND_NARROW_QUERY = '(width < 48rem)';

const matches = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** True when `el` has a box that intersects the viewport (zero-size or scrolled-away drawings are skipped). */
export function isOnScreen(el: Element): boolean {
  const box = (el instanceof SVGElement ? (el.ownerSVGElement ?? el) : el).getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;
  return box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth;
}

/** Whether a stroke starting on `el` should summon the drawing hand. */
export function handCanDraw(el: Element): boolean {
  if (typeof window === 'undefined') return false;
  if (matches(REDUCED_MOTION_QUERY) || matches(HAND_NARROW_QUERY)) return false;
  return isOnScreen(el);
}
