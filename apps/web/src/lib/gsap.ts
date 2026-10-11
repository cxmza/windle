import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EASE_BEZIER } from '@/lib/motion-tokens';

// Register once; import gsap and plugins from here, not from 'gsap' directly.
gsap.registerPlugin(useGSAP, ScrollTrigger, CustomEase);
gsap.defaults({ ease: 'power3.out', duration: 0.6 });
// Mobile address bar show/hide resizes the viewport height only: don't refresh every trigger mid-scroll for it
// (the stages are svh, so their layout does not change either).
ScrollTrigger.config({ ignoreMobileResize: true });

// Named eases mirror --ease-* in tokens.css, so GSAP code can say ease: 'decelerate'.
for (const [name, bezier] of Object.entries(EASE_BEZIER)) {
  CustomEase.create(name, bezier.join(','));
}

/**
 * Parses (and caches) the transform of every target in one batch, before tweens are built on them.
 *
 * CSSPlugin parses an element's transform from getComputedStyle the first time a tween touches it, and while doing so
 * writes `translate/rotate/scale: none` inline (it folds them into `transform`). Element by element that is
 * write-then-read, so each parse forced its own style recalc (measured: ~180 forced recalcs in the first commit for
 * the split titles, and per-char ones mid-scroll). Here: one read pass, one write pass (the same `none`, only where the
 * computed value already is none, so nothing changes visually), then the parse, whose own writes are now no-ops.
 */
export function primeTransforms(targets: ArrayLike<Element>): void {
  const els = Array.from(targets).filter((el): el is HTMLElement => el instanceof HTMLElement);
  const plain = els.filter((el) => {
    const cs = getComputedStyle(el);
    return cs.translate === 'none' && cs.rotate === 'none' && cs.scale === 'none';
  });
  for (const el of plain) {
    el.style.translate = 'none';
    el.style.rotate = 'none';
    el.style.scale = 'none';
  }
  for (const el of els) gsap.getProperty(el, 'yPercent');
}

/**
 * SplitText as its own chunk: only the captions use it (line split), and only after first paint (Caption.tsx), so it
 * stays off the first-paint path. Resolves with the registered plugin; the import is shared, so it loads once.
 */
let splitText: Promise<typeof import('gsap/SplitText').SplitText> | null = null;
export function loadSplitText() {
  splitText ??= import('gsap/SplitText').then(({ SplitText }) => {
    gsap.registerPlugin(SplitText);
    return SplitText;
  });
  return splitText;
}

export { gsap, ScrollTrigger, useGSAP };
