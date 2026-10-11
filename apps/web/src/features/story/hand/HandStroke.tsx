import { buildStrokePaths } from './freehand';
import type { Size, StrokeDef } from './types';

type HandStrokeProps = {
  stroke: StrokeDef;
  /** Owning drawing id; makes `data-stroke` globally unique and seeds the wobble. */
  drawingId: string;
  /** 0-based position inside the drawing, exposed as `data-stroke-order` for staggering. */
  order: number;
  /** Unique DOM id prefix for this stroke's mask. */
  maskId: string;
  viewBox: Size;
};

/** Mask pen is wider than the nib so the whole outline (incl. wobble) is covered when fully drawn. */
const MASK_WIDTH_FACTOR = 3;
const DEFAULT_SIZE = 3;

/**
 * One hand-drawn stroke.
 *
 * DRAW-ON CONTRACT (for motion): perfect-freehand yields a filled outline polygon, which cannot be revealed with
 * stroke-dashoffset itself. So each stroke is `<g data-stroke="drawing.id">` holding
 *   - `<path data-stroke-ink>`    the visible filled outline, masked by...
 *   - `<mask><path data-stroke-center pathLength="1">`  the CENTERLINE stroked in white (dasharray 1, offset 0).
 * To draw a stroke on: animate `[data-stroke-center]` `stroke-dashoffset` 1 -> 0 (DrawSVG-style). Fully drawn
 * (offset 0) is the default render, so reduced motion / no JS shows the finished drawing.
 * The centerline sits inside <mask>, still reachable with `svg.querySelectorAll('[data-stroke-center]')`.
 */
export function HandStroke({ stroke, drawingId, order, maskId, viewBox }: HandStrokeProps) {
  const { outline, center, length } = buildStrokePaths(stroke, `${drawingId}.${stroke.id}`);
  const size = stroke.size ?? DEFAULT_SIZE;
  return (
    <g data-stroke={`${drawingId}.${stroke.id}`} data-stroke-order={order} data-stroke-role={stroke.role ?? 'body'}>
      <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={viewBox.w} height={viewBox.h}>
        <path
          data-stroke-center
          d={center}
          data-length={length}
          fill="none"
          stroke="white"
          strokeWidth={size * MASK_WIDTH_FACTOR}
          strokeLinecap="butt"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={0}
        />
      </mask>
      <path data-stroke-ink d={outline} fill="currentColor" mask={`url(#${maskId})`} />
    </g>
  );
}
