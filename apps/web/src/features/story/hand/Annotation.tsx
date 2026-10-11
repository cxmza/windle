import type { ComponentPropsWithRef, CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { HandDrawing } from './HandDrawing';
import { ANNOTATIONS, type AnnotationId } from './strokes';
import type { AnnotationDef } from './types';

type AnnotationProps = Omit<ComponentPropsWithRef<'span'>, 'children'> & {
  id: AnnotationId;
  /** 'light' = white ink on black; 'dark' = black ink for white (emphasis) blocks. */
  tone?: 'light' | 'dark';
  /** Fill the box non-uniformly (set a width AND a height; for strike-throughs over text of unknown length). */
  stretch?: boolean;
};

/**
 * A margin annotation: strokes + optional handwritten note, purely decorative (aria-hidden, no pointer events).
 * Size it and position it from outside with `className` (width decides the scale; height follows the viewBox).
 * Secondary annotations are hidden below md so 360px stays readable.
 *
 * Motion hooks: root `[data-annotation=<id>]`, strokes `[data-stroke]` (see HandStroke.tsx for the draw-on
 * contract), note `[data-annotation-note]`.
 */
export function Annotation({ id, tone = 'light', stretch = false, className, style, ...props }: AnnotationProps) {
  const def: AnnotationDef = ANNOTATIONS[id];
  const { w, h } = def.viewBox;
  const rootStyle: CSSProperties = {
    aspectRatio: stretch ? 'auto' : `${w} / ${h}`,
    containerType: 'inline-size',
    ...style,
  };
  return (
    <span
      aria-hidden="true"
      data-annotation={id}
      data-annotation-kind={def.kind}
      data-priority={def.priority}
      data-tone={tone}
      style={rootStyle}
      className={cn(
        'pointer-events-none relative block select-none',
        tone === 'light' ? 'text-ink' : 'text-ink-inverse',
        def.priority === 'secondary' && 'max-md:hidden',
        className,
      )}
      {...props}
    >
      <HandDrawing
        id={id}
        drawing={def}
        preserveAspectRatio={stretch ? 'none' : undefined}
        className="absolute inset-0 size-full"
      />
      {def.note && (
        <span
          data-annotation-note
          className="absolute whitespace-nowrap font-hand font-semibold leading-none"
          style={{
            left: `${def.note.x}%`,
            top: `${def.note.y}%`,
            // floor keeps handwriting legible when the drawing is small
            fontSize: `max(1.125rem, ${def.note.size}cqw)`,
            transform: `rotate(${def.note.rotate ?? 0}deg)`,
          }}
        >
          {def.note.text}
        </span>
      )}
    </span>
  );
}
