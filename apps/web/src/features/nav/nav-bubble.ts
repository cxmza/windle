import { type FocusEvent, type PointerEvent, useLayoutEffect, useRef } from 'react';

const ITEM = '[data-dock-item]';
const RESTING = '[data-dock-item][data-state="open"], [data-dock-item][aria-current], [data-dock-item][data-active]';
const BASE_WIDTH = 96;

/**
 * One glass bubble that slides between the capsule's items: under the pointer or focus, else under the open or active
 * item, else hidden. Moves with transform only (translateX + scaleX, written as custom properties on the bubble, no
 * React state). `restKey` re-settles it when the active or open item changes.
 */
export function useNavBubble<R extends HTMLElement>(restKey: string) {
  const rootRef = useRef<R>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const pointed = useRef<Element | null>(null);

  const settle = () => {
    const root = rootRef.current;
    const bubble = bubbleRef.current;
    if (!root || !bubble) return;
    const target = pointed.current ?? root.querySelector(RESTING);
    if (!target) {
      bubble.removeAttribute('data-visible');
      return;
    }
    const from = root.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    bubble.style.width = `${BASE_WIDTH}px`;
    bubble.style.setProperty('--bubble-x', `${to.left - from.left}px`);
    bubble.style.setProperty('--bubble-s', String(to.width / BASE_WIDTH));
    bubble.setAttribute('data-visible', '');
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: restKey is the trigger, settle reads the DOM
  useLayoutEffect(() => {
    settle();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(settle);
    observer.observe(root);
    return () => observer.disconnect();
  }, [restKey]);

  const point = (el: Element | null) => {
    pointed.current = el;
    settle();
  };

  return {
    rootRef,
    bubbleRef,
    handlers: {
      onPointerOver: (event: PointerEvent<HTMLElement>) =>
        point(event.target instanceof Element ? event.target.closest(ITEM) : null),
      onPointerLeave: () => point(null),
      onFocus: (event: FocusEvent<HTMLElement>) => point(event.target.closest(ITEM)),
      onBlur: () => point(null),
    },
  };
}
