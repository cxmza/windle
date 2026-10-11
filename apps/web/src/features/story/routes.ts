import { CHAPTER_SEO } from '../../../scripts/chapter-seo.ts';
import { CHAPTERS, type ChapterKey } from './chapters';

/**
 * Clean (hash-free) paths of the single-page story: one per chapter. nginx serves index.html for exactly these
 * (infra/nginx/sites/windle-20-www.conf), everything else is a real 404 - keep both lists in sync.
 */
export const CHAPTER_PATHS = {
  hero: '/',
  promise: '/promise',
  collateral: '/collateral',
  market: '/market',
  incentive: '/incentive',
  judge: '/judge',
  outcome: '/outcome',
  ecosystem: '/ecosystem',
  cta: '/launch',
} as const satisfies Record<ChapterKey, string>;

export function chapterPath(id: ChapterKey): string {
  return CHAPTER_PATHS[id];
}

/** Pure: the chapter a pathname belongs to (trailing slash and `/index.html` tolerated), or null for an unknown path. */
export function chapterFromPath(pathname: string): ChapterKey | null {
  const clean = pathname === '/index.html' ? '/' : pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const found = CHAPTERS.find((chapter) => CHAPTER_PATHS[chapter.id] === clean);
  return found ? found.id : null;
}

export const SITE_NAME = 'windle';

/** The document title of a chapter: the same string the pre-rendered page ships (scripts/chapter-seo.ts). */
export function chapterTitle(id: ChapterKey): string {
  return CHAPTER_SEO[id].title;
}
