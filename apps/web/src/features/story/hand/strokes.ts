import type { LogoSlotId } from '../chapters';
import { arrow, boxOutline, capsuleHalf, loop, polygon, roundedOutline, scribble, wave } from './shapes';
import type { AnnotationDef, DrawingDef } from './types';

/**
 * The authored hand-drawn content. Coordinates are viewBox units; every drawing is one or more strokes
 * (point lists). English margin notes, trader style.
 *
 * Stroke order inside `strokes` is the order a hand would draw them (motion staggers by it).
 */

const marketArrow = arrow([98, 66], [40, 8], 18);
const incentiveArrow = arrow([128, 100], [112, 74], -10, { length: 9, spread: 0.5 });
const shipArrow = arrow([40, 74], [30, 6], -14);
const slashArrow = arrow([40, 74], [30, 6], 14);

export const ANNOTATIONS = {
  /** Hero: small wavy underline beneath the word "judge" in the sub-line. */
  'hero-underline': {
    kind: 'underline',
    priority: 'primary',
    viewBox: { w: 100, h: 14 },
    strokes: [
      { id: 'under', points: wave([2, 5], [98, 4], 1.8, 2.5), size: 2.6, role: 'body' },
      { id: 'under-2', points: wave([10, 10], [88, 9], 1.2, 2), size: 2, role: 'body' },
    ],
  },
  /** Market: arrow up to the chip with a note below it. */
  'market-odds': {
    kind: 'arrow',
    priority: 'primary',
    viewBox: { w: 240, h: 84 },
    note: { text: 'price = odds', x: 42, y: 56, rotate: -3, size: 9 },
    strokes: [
      { id: 'shaft', points: marketArrow.shaft, size: 3, role: 'shaft' },
      { id: 'head', points: marketArrow.head, size: 3, role: 'head' },
    ],
  },
  /** Incentive: a loop around SHIPPING and a note under it. */
  'incentive-loop': {
    kind: 'loop',
    priority: 'primary',
    viewBox: { w: 220, h: 130 },
    anchor: { edge: 'box', box: { x: 30, y: 28, w: 160 }, h: 36 },
    note: { text: 'only way up', x: 46, y: 80, rotate: -4, size: 11 },
    strokes: [
      { id: 'loop', points: loop(110, 46, 98, 30), size: 3.2, role: 'body' },
      { id: 'shaft', points: incentiveArrow.shaft, size: 2.6, role: 'shaft' },
      { id: 'head', points: incentiveArrow.head, size: 2.6, role: 'head' },
    ],
  },
  /** Judge: side note with a scribbled underline. */
  'judge-note': {
    kind: 'scribble',
    priority: 'secondary',
    viewBox: { w: 200, h: 64 },
    note: { text: 'math, not opinions.', x: 4, y: 4, rotate: 2, size: 11 },
    strokes: [{ id: 'scribble', points: scribble([4, 52], [150, 50], 4, 5), size: 2.4, role: 'body' }],
  },
  /**
   * Reusable strike-through (a long scribbled line); stretch it over a struck-out value.
   * Used by the outcome chooser to cross out the destination the reader did NOT pick.
   */
  'strike-through': {
    kind: 'strike',
    priority: 'primary',
    viewBox: { w: 160, h: 16 },
    anchor: { edge: 'box', box: { x: 0, y: 0, w: 160 }, h: 16 },
    strokes: [{ id: 'strike', points: scribble([2, 9], [158, 6], 2.5, 3), size: 2.6, role: 'body' }],
  },
  /** Outcome / SHIP: where the collateral goes. */
  'outcome-ship': {
    kind: 'arrow',
    priority: 'secondary',
    viewBox: { w: 220, h: 100 },
    note: { text: 'collateral comes home', x: 20, y: 62, rotate: -2, size: 8.5 },
    strokes: [
      { id: 'shaft', points: shipArrow.shaft, size: 3, role: 'shaft' },
      { id: 'head', points: shipArrow.head, size: 3, role: 'head' },
    ],
  },
  /** Outcome / SLASH. */
  'outcome-slash': {
    kind: 'arrow',
    priority: 'secondary',
    viewBox: { w: 220, h: 100 },
    note: { text: 'goes to NO holders', x: 20, y: 62, rotate: 2, size: 9 },
    strokes: [
      { id: 'shaft', points: slashArrow.shaft, size: 3, role: 'shaft' },
      { id: 'head', points: slashArrow.head, size: 3, role: 'head' },
    ],
  },
} as const satisfies Record<string, AnnotationDef>;

export type AnnotationId = keyof typeof ANNOTATIONS;

/** Checklist slot glyphs: a hand-drawn box, a check, a cross. Same 28x28 viewBox so they stack. */
export const GLYPHS = {
  box: {
    viewBox: { w: 28, h: 28 },
    strokes: [{ id: 'box', points: boxOutline(4, 4, 20, 20), size: 2, role: 'body' }],
  },
  check: {
    viewBox: { w: 28, h: 28 },
    strokes: [
      {
        id: 'check',
        points: [
          [6, 15],
          [11.5, 21],
          [23.5, 5],
        ],
        size: 3.2,
        role: 'body',
      },
    ],
  },
  cross: {
    viewBox: { w: 28, h: 28 },
    strokes: [
      {
        id: 'cross-a',
        points: [
          [7, 7],
          [21, 21],
        ],
        size: 3.2,
        role: 'body',
      },
      {
        id: 'cross-b',
        points: [
          [21, 6.5],
          [7, 21.5],
        ],
        size: 3.2,
        role: 'body',
      },
    ],
  },
} as const satisfies Record<string, DrawingDef>;

export type GlyphId = keyof typeof GLYPHS;

/**
 * Hand-drawn outline for an arbitrary box (e.g. a hovered `[data-sketch-target]`), as a DrawingDef the pencil layer
 * can render with HandDrawing. Two overlapping passes read as sketched twice. `radius` is the target's own corner
 * radius in px: the outline follows it, offset by `pad` (a pill gets a capsule, not a rectangle).
 */
export function outlineDrawing(width: number, height: number, pad = 6, radius = 0): DrawingDef {
  const w = width + pad * 2;
  const h = height + pad * 2;
  const r = radius > 0 ? radius + pad : 0;
  return {
    viewBox: { w, h },
    strokes: [
      { id: 'pass-1', points: roundedOutline(2, 2, w - 4, h - 4, r - 2), size: 2.2, role: 'body' },
      { id: 'pass-2', points: roundedOutline(4, 3, w - 8, h - 5, r - 3), size: 1.6, role: 'body' },
    ],
  };
}

/**
 * Sketch outlines of the ecosystem logos (square 100x100 viewBox). They are the "drawn" half of the sketch -> 3D
 * handoff (see logo-sketch.ts): the hand draws these in each `[data-logo-slot]`, then the 3D layer extrudes the real
 * logo over the slot. Simplified silhouettes of the public marks, not traced artwork.
 *
 * Stroke order = drawing order. Solana: three slanted bars, top to bottom. pump.fun: a capsule tilted -45deg and split
 * in half along its waist, one half then the other. X: the thick stroke, then the thin one.
 */
export const LOGO_SKETCHES = {
  solana: {
    viewBox: { w: 100, h: 100 },
    strokes: [
      {
        id: 'bar-top',
        points: polygon([
          [24, 20],
          [94, 20],
          [78, 38],
          [8, 38],
        ]),
        size: 2.6,
        role: 'body',
      },
      {
        id: 'bar-mid',
        points: polygon([
          [8, 44],
          [78, 44],
          [94, 62],
          [24, 62],
        ]),
        size: 2.6,
        role: 'body',
      },
      {
        id: 'bar-bottom',
        points: polygon([
          [24, 68],
          [94, 68],
          [78, 86],
          [8, 86],
        ]),
        size: 2.6,
        role: 'body',
      },
    ],
  },
  pumpfun: {
    viewBox: { w: 100, h: 100 },
    strokes: [
      { id: 'half-a', points: capsuleHalf(50, 50, 82, 40, -45, 0), size: 2.8, role: 'body' },
      { id: 'half-b', points: capsuleHalf(50, 50, 82, 40, -45, 1), size: 2.8, role: 'body' },
    ],
  },
  x: {
    viewBox: { w: 100, h: 100 },
    strokes: [
      {
        id: 'stroke-thick',
        points: [
          [16, 14],
          [84, 86],
        ],
        size: 5,
        role: 'body',
      },
      {
        id: 'stroke-thin',
        points: [
          [84, 14],
          [16, 86],
        ],
        size: 3,
        role: 'body',
      },
    ],
  },
} as const satisfies Record<LogoSlotId, DrawingDef>;
