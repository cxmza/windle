import { type RefObject, useLayoutEffect, useRef } from 'react';

type Snapshot = { list: HTMLElement | null; tops: Map<string, number>; nodes: Map<string, HTMLElement> };

function token(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function toMs(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return value.endsWith('ms') ? n : n * 1000;
}

/**
 * FLIP for a short keyed list: rows that moved glide to their new place, new rows fade in, removed rows
 * fade out from a clone in `ghosts` (an absolutely positioned layer over the list). Children mark
 * themselves with `data-flip-key`. Runs only when `order` changes; does nothing when `reduced`.
 */
export function useListFlip(
  list: RefObject<HTMLElement | null>,
  ghosts: RefObject<HTMLElement | null>,
  order: string,
  reduced: boolean,
) {
  const prev = useRef<Snapshot>({ list: null, tops: new Map(), nodes: new Map() });

  useLayoutEffect(() => {
    const el = list.current;
    const before = prev.current;
    const tops = new Map<string, number>();
    const nodes = new Map<string, HTMLElement>();
    if (el) {
      for (const node of el.querySelectorAll<HTMLElement>(':scope > [data-flip-key]')) {
        const key = node.dataset.flipKey;
        if (key === undefined) continue;
        tops.set(key, node.offsetTop);
        nodes.set(key, node);
      }
    }
    prev.current = { list: el, tops, nodes };
    if (!el || reduced || before.list !== el || order === '' || typeof el.animate !== 'function') return;

    const move = { duration: toMs(token(el, '--dur-base')), easing: token(el, '--ease-standard') || 'ease' };
    const enter = { duration: toMs(token(el, '--dur-fast')), easing: token(el, '--ease-decelerate') || 'ease-out' };
    const leave = { duration: toMs(token(el, '--dur-fast')), easing: token(el, '--ease-accelerate') || 'ease-in' };

    for (const [key, node] of nodes) {
      const was = before.tops.get(key);
      const top = tops.get(key) ?? 0;
      if (was === undefined) node.animate([{ opacity: 0 }, { opacity: 1 }], enter);
      else if (was !== top) node.animate([{ translate: `0 ${was - top}px` }, { translate: '0 0' }], move);
    }

    const layer = ghosts.current;
    if (!layer) return;
    for (const [key, node] of before.nodes) {
      if (nodes.has(key)) continue;
      const ghost = node.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-flip-key');
      ghost.inert = true;
      Object.assign(ghost.style, {
        position: 'absolute',
        top: `${before.tops.get(key) ?? 0}px`,
        left: '0',
        right: '0',
        listStyle: 'none',
      });
      layer.append(ghost);
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { ...leave, fill: 'forwards' }).finished.then(
        () => ghost.remove(),
        () => ghost.remove(),
      );
    }
  }, [list, ghosts, order, reduced]);
}
