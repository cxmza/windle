import { type ComponentPropsWithRef, useId } from 'react';
import { HandStroke } from './HandStroke';
import type { DrawingDef } from './types';

type HandDrawingProps = Omit<ComponentPropsWithRef<'svg'>, 'viewBox' | 'children'> & {
  /** Stable name; prefixes every `data-stroke`. */
  id: string;
  drawing: DrawingDef;
};

/**
 * Renders a DrawingDef as an inline decorative SVG (aria-hidden, currentColor ink, overflow visible so the
 * wobble never clips). Colour comes from the surrounding `text-ink` / `text-ink-inverse`.
 */
export function HandDrawing({ id, drawing, className, ...props }: HandDrawingProps) {
  const uid = useId().replace(/\W/g, '');
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${drawing.viewBox.w} ${drawing.viewBox.h}`}
      data-drawing={id}
      className={className}
      overflow="visible"
      {...props}
    >
      {drawing.strokes.map((stroke, order) => (
        <HandStroke
          key={stroke.id}
          stroke={stroke}
          drawingId={id}
          order={order}
          maskId={`${uid}-${stroke.id}`}
          viewBox={drawing.viewBox}
        />
      ))}
    </svg>
  );
}
