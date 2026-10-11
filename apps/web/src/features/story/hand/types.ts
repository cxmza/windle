/**
 * Hand-drawn layer: typed data model.
 *
 * Everything drawn by hand is authored as POINT LISTS (see strokes.ts) and turned into SVG paths at render
 * time by freehand.ts. No path string is hand-edited.
 */

/** [x, y] in the owning drawing's viewBox units. */
export type Point = readonly [x: number, y: number];

export type StrokeRole = 'shaft' | 'head' | 'body';

export type StrokeDef = {
  /** Unique inside its drawing; becomes `data-stroke="<drawing>.<id>"`. */
  id: string;
  /** Dense-ish centerline samples (shapes.ts helpers produce them). */
  points: readonly Point[];
  /** Nib width in viewBox units. */
  size?: number;
  role?: StrokeRole;
};

export type Size = { w: number; h: number };

/** A set of strokes in one viewBox. Used standalone for glyphs (box/check/cross). */
export type DrawingDef = {
  viewBox: Size;
  strokes: readonly StrokeDef[];
};

export type AnnotationKind = 'arrow' | 'loop' | 'underline' | 'scribble' | 'strike' | 'note';

export type NoteDef = {
  text: string;
  /** Anchor of the note's top-left, in % of the viewBox. */
  x: number;
  y: number;
  /** Degrees; handwriting is never perfectly level. */
  rotate?: number;
  /** Font size as % of the drawing's width (container-query units), floored for legibility in CSS. */
  size: number;
};

/**
 * Where the drawing sits relative to a DOM target (a word). `box` is the region of the viewBox that the target's
 * rectangle maps onto (uniform scale by width). `edge: 'bottom'` instead pins the box's top-left to the target's
 * bottom-left (underlines).
 */
export type AnchorDef = {
  box: { x: number; y: number; w: number };
  edge: 'box' | 'bottom';
  /** Height of `box` in viewBox units (only used for edge 'box': vertical centring). */
  h?: number;
};

export type AnnotationDef = DrawingDef & {
  kind: AnnotationKind;
  /** Secondary annotations are hidden below the md breakpoint. */
  priority: 'primary' | 'secondary';
  note?: NoteDef;
  anchor?: AnchorDef;
};

export type StrokePaths = {
  /** Closed filled outline polygon from perfect-freehand (what you see). */
  outline: string;
  /** Open smooth centerline of the same stroke (what you draw along: mask / dashoffset). */
  center: string;
  /** Centerline length in viewBox units (informational; motion should prefer pathLength=1). */
  length: number;
};
