import { CHAPTERS, type Chapter, type ChapterKey, ECOSYSTEM } from '../story/chapters';

export interface ProtocolItem {
  id: ChapterKey;
  /** Two-digit chapter number shown in the menu. */
  number: string;
  label: string;
  summary: string;
}

const LABELS: Partial<Record<ChapterKey, string>> = { promise: 'How it works' };

const chapters: readonly Chapter[] = CHAPTERS;

/** Every narrative chapter (between the hero and the final CTA), in page order: the rows of the Protocol menu. */
export const PROTOCOL_ITEMS: readonly ProtocolItem[] = chapters.slice(1, -1).map((chapter) => ({
  id: chapter.id,
  number: String(chapter.index).padStart(2, '0'),
  label: LABELS[chapter.id] ?? chapter.name,
  summary: chapter.summary ?? chapter.caption,
}));

export const DOCS_URL = 'https://docs.windle.fun';
export const SIGN_IN_URL = 'https://oauth.windle.fun';
/** The real app. The in-page final chapter (/launch) stays reachable by scrolling; it is not the Launch button's target. */
export const APP_URL = 'https://app.windle.fun';

/** The project's X link: the same (placeholder) entry the ecosystem chapter uses, so there is one source of truth. */
export const X_LINK = ECOSYSTEM.find((item) => item.slot === 'x');

/** Chapters that have their own top-level link in the bar; they do not light up the Protocol trigger. */
const OWN_LINK: readonly ChapterKey[] = ['ecosystem'];

/** Id of the narrative chapter that matches the active chapter index, or null (hero, final CTA). */
export function activeProtocolId(active: number): ChapterKey | null {
  const id = chapters[active]?.id;
  return PROTOCOL_ITEMS.some((item) => item.id === id) ? (id ?? null) : null;
}

/** Pure: whether the Protocol trigger is the active top-level item. */
export function isProtocolActive(activeId: ChapterKey | null): boolean {
  return activeId !== null && !OWN_LINK.includes(activeId);
}
