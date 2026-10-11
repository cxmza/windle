import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Annotation } from './Annotation';
import { ANNOTATIONS } from './strokes';
import type { AnnotationDef } from './types';

type AnchoredAnnotationProps = Omit<ComponentProps<typeof Annotation>, 'style' | 'ref'> & {
  /** CSS selector of the word to draw around, resolved inside the nearest `[data-chapter-stage]`. */
  target: string;
};

type Placement = { left: number; top: number; width: number };

const HIDDEN = { visibility: 'hidden' } as const;

/** Layout position of `el` inside `ancestor` in untransformed px (offset* ignores GSAP transforms and clip masks). */
function layoutBox(el: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
  }
  return node === ancestor ? { left, top, width: el.offsetWidth, height: el.offsetHeight } : null;
}

const round = (n: number) => Math.round(n * 2) / 2;

/**
 * An annotation pinned to a word that lives in someone else's markup (e.g. the emphasised word of a caption).
 * It is a sibling of that markup (never inside the caption's split/clipped DOM), absolutely positioned inside the
 * chapter stage and re-measured on resize, font load and text re-splits. Uses layout offsets, so scroll-driven
 * transforms on the target do not move it; it hides itself until the first measurement.
 * The drawing's `anchor` (strokes.ts) says how the viewBox maps onto the word.
 */
export function AnchoredAnnotation({ id, target, className, ...props }: AnchoredAnnotationProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useEffect(() => {
    const root = ref.current;
    const stage = root?.closest<HTMLElement>('[data-chapter-stage]');
    const def: AnnotationDef = ANNOTATIONS[id];
    const a = def.anchor;
    if (!stage || !a) return;
    const { viewBox } = def;
    let frame = 0;

    const measure = () => {
      const word = stage.querySelector<HTMLElement>(target);
      const box = word ? layoutBox(word, stage) : null;
      if (!box || box.width === 0) {
        setPlacement(null);
        return;
      }
      const scale = box.width / a.box.w;
      const left = round(box.left - a.box.x * scale);
      const top =
        a.edge === 'bottom'
          ? round(box.top + box.height - a.box.y * scale)
          : round(box.top + box.height / 2 - (a.box.y + (a.h ?? 0) / 2) * scale);
      const width = round(viewBox.w * scale);
      setPlacement((prev) =>
        prev && prev.left === left && prev.top === top && prev.width === width ? prev : { left, top, width },
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(stage);
    const mutations = new MutationObserver(schedule); // SplitText re-splits lines on resize
    mutations.observe(stage, { childList: true, subtree: true, characterData: true });
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutations.disconnect();
    };
  }, [id, target]);

  return (
    <Annotation
      ref={ref}
      id={id}
      data-anchored=""
      style={placement ? { left: placement.left, top: placement.top, width: placement.width } : HIDDEN}
      className={cn('absolute top-0 left-0', className)}
      {...props}
    />
  );
}
