import type { SceneKey } from '../chapters';
import { type Band, FITTED, type MarkSlot, type MarkSlots } from './poses';

/**
 * Where the 3D mark may sit without crossing text (hero and final CTA). Measured from the DOM layout, not from
 * hard-coded fractions: the title sizes with vw, the stage with svh, so the free space differs per viewport.
 *
 * A slot is a square the mark fits in, chosen as the largest of: beside the text column (wide screens), above the
 * title block, below the actions. Obstacles: the text column from the kicker to the actions (the mark's silhouette
 * stays whole, and titles/outline buttons have no backing of their own). The subtitle sits inside that column.
 *
 * Positions come from offsetLeft/offsetTop sums inside the sticky chapter stage, so they are the resting layout:
 * entrance transforms (GSAP) and the chapter-scale transition do not skew them. Read on resize / font load only.
 */

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Gap between the mark's square and any text, px. */
const GAP = 24;
/** Smallest useful slot, px: below this the candidate is ignored. */
const MIN_SLOT = 72;
/** Biggest the mark gets, as a share of the viewport height. */
const MAX_SHARE = 0.56;
/**
 * The mark's own box is MARK.size square; turned (yaw sway, tilt) and squashed by the jelly it reaches past that.
 * The slot is shrunk by this so the moving mark stays inside it.
 */
const FIT = 0.86;

/** Layout box of `el` relative to `stage` (offsetParent chain; transforms ignored). Null when not inside it. */
function layoutBox(el: Element | null, stage: HTMLElement): Box | null {
  if (!(el instanceof HTMLElement)) return null;
  let l = 0;
  let t = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stage) {
    l += node.offsetLeft;
    t += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    node = parent instanceof HTMLElement ? parent : null;
  }
  if (node !== stage || el.offsetWidth === 0) return null;
  return { l, t, r: l + el.offsetWidth, b: t + el.offsetHeight };
}

/**
 * Like layoutBox, but narrowed horizontally to the glyphs: a heading is a full-width block whose text is centred in
 * it. The ink extent comes from a Range, normalised by the element's own rendered box (so an ancestor scale does not
 * skew it); vertical extent stays the layout box (entrance transforms move glyphs vertically).
 */
function inkBox(el: Element | null, stage: HTMLElement): Box | null {
  const box = layoutBox(el, stage);
  if (!box || !(el instanceof HTMLElement)) return box;
  const range = document.createRange();
  range.selectNodeContents(el);
  const ink = range.getBoundingClientRect();
  const own = el.getBoundingClientRect();
  if (ink.width === 0 || own.width === 0) return box;
  const k = el.offsetWidth / own.width;
  return {
    ...box,
    l: box.l + Math.max(0, ink.left - own.left) * k,
    r: box.l + Math.min(own.width, ink.right - own.left) * k,
  };
}

const union = (boxes: Array<Box | null>): Box | null =>
  boxes.reduce<Box | null>((acc, b) => {
    if (!b) return acc;
    if (!acc) return { ...b };
    return { l: Math.min(acc.l, b.l), t: Math.min(acc.t, b.t), r: Math.max(acc.r, b.r), b: Math.max(acc.b, b.b) };
  }, null);

interface Candidate {
  /** Square size, px, and its centre. */
  size: number;
  cx: number;
  cy: number;
}

function square(region: Box, prefY: number): Candidate {
  const size = Math.max(0, Math.min(region.r - region.l, region.b - region.t));
  const half = size / 2;
  const cy = Math.min(Math.max(prefY, region.t + half), region.b - half);
  return { size, cx: (region.l + region.r) / 2, cy };
}

function measure(stage: HTMLElement, text: Box): MarkSlot | null {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (w === 0 || h === 0) return null;
  const cs = getComputedStyle(stage);
  // the stage padding is the header above and the dock below: the mark stays inside it
  const top = Number.parseFloat(cs.paddingTop) || 0;
  // narrow: the bottom gutter is thin, and a mark resting on the screen edge reads as cut off
  const bottom = h - Math.max(Number.parseFloat(cs.paddingBottom) || 0, w <= NARROW_MAX_PX ? h * NARROW_EDGE : 0);
  const left = Number.parseFloat(cs.paddingLeft) || 0;
  const right = w - (Number.parseFloat(cs.paddingRight) || 0);

  const candidates: Candidate[] = [
    // beside the text column (right side: the reading order ends there and the next scene's object lives there)
    square({ l: text.r + GAP, t: top, r: right, b: bottom }, (text.t + text.b) / 2),
    // above the title
    square({ l: left, t: top, r: right, b: text.t - GAP }, h / 2),
    // below the actions
    square({ l: left, t: text.b + GAP, r: right, b: bottom }, h / 2),
  ];
  let best: Candidate | null = null;
  for (const c of candidates) if (c.size >= MIN_SLOT && (!best || c.size > best.size)) best = c;
  if (!best) return null;
  const size = Math.min(best.size, h * MAX_SHARE) * FIT;
  // to NDC (y up); h is the NDC height of the mark's square
  return { x: (best.cx / w) * 2 - 1, y: 1 - (best.cy / h) * 2, h: (size / h) * 2 };
}

const stageOf = (scene: string) => document.querySelector<HTMLElement>(`[data-scene="${scene}"] [data-chapter-stage]`);

/** Narrow layout breakpoint (Tailwind md): below it the text column spans the stage and objects go above/below. */
const NARROW_MAX_PX = 767;
/** Narrow: minimum clearance under the mark's slot, share of the stage height. */
const NARROW_EDGE = 0.08;
/** Gap between a band and the text block, px (objects turn and bob inside the band). */
const BAND_GAP = 16;

/**
 * Narrow screens: for each FITTED chapter, the larger of the two text-free bands of its stage (between the header
 * padding and the text block's top, or between its bottom and the bottom padding). The text block is the union of
 * the stage's in-flow children (absolute annotations ride on them); entrance transforms are ignored (layout boxes).
 */
function measureBands(): MarkSlots['bands'] {
  const bands: Partial<Record<SceneKey, Band>> = {};
  for (const key of FITTED) {
    const stage = stageOf(key);
    if (!stage) continue;
    const h = stage.clientHeight;
    if (h === 0) continue;
    const kids = Array.from(stage.children).filter((el) => {
      const pos = getComputedStyle(el).position;
      return pos !== 'absolute' && pos !== 'fixed' && !el.classList.contains('sr-only');
    });
    const text = union(kids.map((el) => layoutBox(el, stage)));
    if (!text) continue;
    const cs = getComputedStyle(stage);
    const top = Number.parseFloat(cs.paddingTop) || 0;
    const bottom = h - (Number.parseFloat(cs.paddingBottom) || 0);
    const above = { t: top, b: text.t - BAND_GAP };
    const below = { t: text.b + BAND_GAP, b: bottom };
    const best = above.b - above.t >= below.b - below.t ? above : below;
    const size = Math.max(0, best.b - best.t);
    bands[key] = { y: 1 - (best.t + best.b) / h, h: (size / h) * 2 };
  }
  return bands;
}

export function measureMarkSlots(): MarkSlots {
  const slots: MarkSlots = {};
  if (window.innerWidth <= NARROW_MAX_PX) slots.bands = measureBands();
  const hero = stageOf('hero');
  if (hero) {
    const text = union([
      layoutBox(hero.querySelector('[data-hero-kicker]'), hero),
      inkBox(hero.querySelector('h1'), hero),
      layoutBox(hero.querySelector('[data-cta-row]'), hero),
    ]);
    const slot = text && measure(hero, text);
    if (slot) slots.hero = slot;
  }
  const cta = stageOf('cta');
  if (cta) {
    const text = union([
      inkBox(cta.querySelector('h2'), cta),
      layoutBox(cta.querySelector('[data-cta-row]'), cta),
      layoutBox(cta.querySelector('#cta-status'), cta),
    ]);
    const slot = text && measure(cta, text);
    if (slot) slots.cta = slot;
  }
  return slots;
}

/** Same values? (re-measures on every resize; only a real change rebuilds the layout context). */
export function sameSlots(a: MarkSlots, b: MarkSlots): boolean {
  const eq = (p?: MarkSlot, q?: MarkSlot) =>
    p === q || (!!p && !!q && Math.abs(p.x - q.x) < 1e-4 && Math.abs(p.y - q.y) < 1e-4 && Math.abs(p.h - q.h) < 1e-4);
  const keys = new Set([...Object.keys(a.bands ?? {}), ...Object.keys(b.bands ?? {})]) as Set<SceneKey>;
  for (const k of keys) {
    const p = a.bands?.[k];
    const q = b.bands?.[k];
    if (!p || !q || Math.abs(p.y - q.y) > 1e-4 || Math.abs(p.h - q.h) > 1e-4) return false;
  }
  return eq(a.hero, b.hero) && eq(a.cta, b.cta);
}
