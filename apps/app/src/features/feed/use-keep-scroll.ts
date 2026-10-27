import { type RefObject, useEffect } from 'react';

/**
 * When a block that starts above the visible top of the scroller changes height, the scroller moves by the same
 * amount, so whatever the reader is looking at stays where it is.
 */
export function keepScroll(block: HTMLElement, scroller: HTMLElement, delta: number): void {
  if (delta === 0) return;
  if (block.getBoundingClientRect().top < scroller.getBoundingClientRect().top) scroller.scrollTop += delta;
}

/** The feed turns native scroll anchoring off (it compensates for new rows itself), so late growth is handled here. */
export function useKeepScroll(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const block = ref.current;
    if (!block || !active || typeof ResizeObserver === 'undefined') return;
    const scroller = block.closest<HTMLElement>('[data-feed-scroll]');
    if (!scroller) return;
    let last = block.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      const height = block.getBoundingClientRect().height;
      keepScroll(block, scroller, height - last);
      last = height;
    });
    observer.observe(block);
    return () => observer.disconnect();
  }, [ref, active]);
}
