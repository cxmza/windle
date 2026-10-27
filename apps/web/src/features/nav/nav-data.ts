import { CHAPTERS, type Chapter, type ChapterKey } from '../story/chapters';

const chapters: readonly Chapter[] = CHAPTERS;

/** Narrative chapters between the hero and the final CTA, in page order. */
const NARRATIVE_IDS: readonly ChapterKey[] = chapters.slice(1, -1).map((chapter) => chapter.id);

/** Where the Protocol link goes: chapter 01, "How it works". */
export const PROTOCOL_TARGET: ChapterKey = chapters[1]?.id ?? 'promise';

export const DOCS_URL = 'https://docs.windle.fun';
export const SIGN_IN_URL = 'https://oauth.windle.fun';
/** The real app. The in-page final chapter (/launch) stays reachable by scrolling; it is not the Launch button's target. */
export const APP_URL = 'https://app.windle.fun';

/** Chapters that have their own top-level link in the bar; they do not light up the Protocol link. */
const OWN_LINK: readonly ChapterKey[] = ['ecosystem'];

/** Id of the narrative chapter that matches the active chapter index, or null (hero, final CTA). */
export function activeProtocolId(active: number): ChapterKey | null {
  const id = chapters[active]?.id;
  return id !== undefined && NARRATIVE_IDS.includes(id) ? id : null;
}

/** Pure: whether the Protocol link is the active top-level item. */
export function isProtocolActive(activeId: ChapterKey | null): boolean {
  return activeId !== null && !OWN_LINK.includes(activeId);
}
