import { type RefObject, useSyncExternalStore } from 'react';
import { ScrollTrigger, useGSAP } from '@/lib/gsap';

/**
 * One scroll model for the whole story, shared by the 3D layer and the DOM.
 *
 * Each chapter section = sticky stage (1 viewport) inside a taller section, so its scroll range splits into:
 * - hold:       section top at viewport top -> section bottom at viewport bottom (stage pinned), 0..1
 * - transition: section bottom at viewport bottom -> viewport top (stage scrolls away, next arrives), 0..1
 * The DOM iris (Chapter.tsx) and the 3D handoff/camera dive both run on `transition`, so they stay in sync.
 *
 * Frame-rate values live in a mutable object (read in useFrame / GSAP), never in React state.
 * Only discrete changes (chapter floor, active chapter) notify React subscribers.
 */
export interface StoryScroll {
  /** Index of the chapter whose range contains the scroll position. */
  chapter: number;
  hold: number;
  transition: number;
  /** Chapter the reader is "in" (switches at the transition midpoint) — drives the indicator. */
  active: number;
  /** +1 forward, -1 back: last change of `active`. */
  direction: 1 | -1;
}

export interface ChapterRange {
  top: number;
  height: number;
  /** Stage height (≈ one viewport, svh). */
  stage: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Pure: where is `scrollY` in the story. Exported for tests. */
export function locate(
  scrollY: number,
  ranges: readonly ChapterRange[],
): Pick<StoryScroll, 'chapter' | 'hold' | 'transition'> {
  let chapter = 0;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r && r.height > 0 && scrollY >= r.top) chapter = i;
  }
  const r = ranges[chapter];
  if (!r) return { chapter: 0, hold: 0, transition: 0 };
  const local = scrollY - r.top;
  const pin = Math.max(r.height - r.stage, 1);
  const isLast = chapter === ranges.length - 1;
  return {
    chapter,
    hold: clamp01(local / pin),
    transition: isLast ? 0 : clamp01((local - pin) / Math.max(r.stage, 1)),
  };
}

export const storyScroll: StoryScroll = { chapter: 0, hold: 0, transition: 0, active: 0, direction: 1 };

const listeners = new Set<() => void>();
let ranges: ChapterRange[] = [];

function update(scrollY: number) {
  const prevChapter = storyScroll.chapter;
  const prevActive = storyScroll.active;
  Object.assign(storyScroll, locate(scrollY, ranges));
  const active = storyScroll.transition >= 0.5 ? storyScroll.chapter + 1 : storyScroll.chapter;
  if (active !== prevActive) {
    storyScroll.direction = active > prevActive ? 1 : -1;
    storyScroll.active = active;
  }
  if (storyScroll.chapter !== prevChapter || storyScroll.active !== prevActive) {
    for (const l of listeners) l();
  }
}

let measuredRoot: HTMLElement | null = null;

let markReady: () => void = () => {};
const storyReady = new Promise<void>((resolve) => {
  markReady = resolve;
});

/** Called by Story.tsx once every chapter is mounted and the ranges are re-measured (deep links wait for it). */
export function markStoryReady() {
  markReady();
}

/** Resolves when the whole story is mounted: a scroll target measured before that can still move. */
export function whenStoryReady(): Promise<void> {
  return storyReady;
}

function measure(root: HTMLElement) {
  measuredRoot = root;
  ranges = Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]')).map((el) => ({
    top: el.getBoundingClientRect().top + window.scrollY,
    height: el.offsetHeight,
    stage: el.querySelector<HTMLElement>('[data-chapter-stage]')?.offsetHeight ?? window.innerHeight,
  }));
}

/**
 * Re-measure the chapter ranges without a global ScrollTrigger.refresh (which re-lays out every trigger and can jump
 * the scroll mid-gesture). For DOM that changed inside sections whose heights did not: the deferred chapters
 * (Story.tsx) replace same-height placeholders, only their sticky stage heights are new.
 */
export function remeasureStory() {
  if (!measuredRoot?.isConnected) return;
  measure(measuredRoot);
  update(window.scrollY);
}

/** Mount once at the story root: measures sections on every ScrollTrigger refresh and feeds the store. */
export function useStoryScrollDriver(rootRef: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      measure(root);
      update(window.scrollY);
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => update(self.scroll()),
        onRefresh: (self) => {
          measure(root);
          update(self.scroll());
        },
      });
      // Webfonts change section heights after first layout.
      document.fonts?.ready.then(() => ScrollTrigger.refresh());
    },
    { scope: rootRef },
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveChapter(): { active: number; direction: 1 | -1 } {
  const active = useSyncExternalStore(
    subscribe,
    () => storyScroll.active,
    () => 0,
  );
  const direction = useSyncExternalStore(
    subscribe,
    () => storyScroll.direction,
    () => 1 as const,
  );
  return { active, direction };
}

/** Floor chapter index (changes at section boundaries) — for mounting/unmounting heavy 3D parts. */
export function useChapterFloor(): number {
  return useSyncExternalStore(
    subscribe,
    () => storyScroll.chapter,
    () => 0,
  );
}
