import { useEffect } from 'react';
import { scrollToY } from '@/lib/smooth-scroll';
import { REDUCED_MOTION_QUERY } from '@/lib/use-media-query';
import { CHAPTERS, type ChapterKey } from './chapters';
import { chapterFromPath, chapterPath, chapterTitle } from './routes';
import { useActiveChapter, whenStoryReady } from './story-scroll';

/**
 * Hash-free routing for the single-page story. Every chapter has a clean path (routes.ts):
 * - links are real `<a href="/market">`; a plain click is intercepted here (pushState + scroll to the chapter);
 *   modified clicks, new-tab links and external hrefs keep the browser's own behaviour;
 * - while the reader scrolls, the active chapter is mirrored into the URL (replaceState) and document.title;
 * - back/forward (popstate) scroll to the chapter of the restored path;
 * - a cold load on a chapter path jumps there once every chapter is mounted and measured (Story.tsx mounts them lazily).
 */

/** After the active chapter changes, wait this long before writing the URL (one write per settled chapter). */
const SYNC_DELAY_MS = 120;
/** A programmatic scroll owns the URL for this long (smooth scrolls pass through other chapters on the way). */
const SMOOTH_LOCK_MS = 1800;
const JUMP_LOCK_MS = 300;
/** Give up waiting for the story to be ready (the URL then follows the scroll again). */
const READY_TIMEOUT_MS = 8000;

let lockUntil = 0;

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;

function setTitle(id: ChapterKey) {
  document.title = chapterTitle(id);
}

function scrollToChapter(id: ChapterKey, immediate: boolean) {
  const section = document.getElementById(id);
  if (!section) return;
  const top = section.getBoundingClientRect().top + window.scrollY;
  lockUntil = performance.now() + (immediate ? JUMP_LOCK_MS : SMOOTH_LOCK_MS);
  scrollToY(top, immediate);
}

/** Go to a chapter: push its path (unless already there) and scroll. */
export function navigateToChapter(id: ChapterKey) {
  const path = chapterPath(id);
  if (window.location.pathname !== path) window.history.pushState(null, '', path + window.location.search);
  setTitle(id);
  scrollToChapter(id, reducedMotion());
}

/** Pure: the chapter a click on `anchor` should navigate to, or null when the browser should handle it. */
export function chapterTarget(event: MouseEvent, base: Location): ChapterKey | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return null;
  const anchor = event.target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href, base.href);
  if (url.origin !== base.origin) return null;
  return chapterFromPath(url.pathname);
}

/** Mount once next to the story (inside the app that renders it). */
export function useStoryRouting() {
  const { active } = useActiveChapter();

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const initial = chapterFromPath(window.location.pathname);
    let cancelled = false;
    let guard = 0;
    if (initial && initial !== 'hero') {
      // keep the scroll-driven URL sync off until the deep link has been honoured
      lockUntil = Number.POSITIVE_INFINITY;
      setTitle(initial);
      const release = () => {
        if (lockUntil === Number.POSITIVE_INFINITY) lockUntil = 0;
      };
      guard = window.setTimeout(release, READY_TIMEOUT_MS);
      void whenStoryReady().then(() => {
        // two frames: the commit of the last chapter has been laid out and the story ranges re-measured
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (cancelled) return;
            window.clearTimeout(guard);
            scrollToChapter(initial, true);
          }),
        );
      });
    }

    const onClick = (event: MouseEvent) => {
      const id = chapterTarget(event, window.location);
      if (!id) return;
      event.preventDefault();
      navigateToChapter(id);
    };
    const onPopState = () => {
      const id = chapterFromPath(window.location.pathname) ?? 'hero';
      setTitle(id);
      scrollToChapter(id, reducedMotion());
    };
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    return () => {
      cancelled = true;
      window.clearTimeout(guard);
      lockUntil = 0;
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  // scroll -> URL: only when the active chapter changes, settled for SYNC_DELAY_MS, never during a programmatic scroll
  useEffect(() => {
    const id = CHAPTERS[active]?.id;
    if (!id) return;
    const wait = Math.max(SYNC_DELAY_MS, lockUntil - performance.now());
    if (!Number.isFinite(wait)) return;
    const timer = window.setTimeout(() => {
      const path = chapterPath(id);
      if (window.location.pathname !== path) {
        window.history.replaceState(window.history.state, '', path + window.location.search);
      }
      setTitle(id);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [active]);
}
