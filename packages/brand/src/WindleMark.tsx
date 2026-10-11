import type { ComponentPropsWithRef } from 'react';
import { cn } from './cn.ts';

/**
 * The "notch" mark in a 120x120 box: a rounded square with three wedges cut out of it (two from the top edge, one
 * from the bottom) so a W emerges in negative space. One outline path instead of a mask: the cuts are true
 * transparency, whatever is behind the mark shows through. Keep in sync with assets/favicon.svg (a test checks it).
 */
export const WINDLE_MARK_PATH =
  'M30 14 H32.5 L44 58 L55.5 14 H64.5 L76 58 L87.5 14 H90 A16 16 0 0 1 106 30 V90 A16 16 0 0 1 90 106 H73.3 L60 70 L46.7 106 H30 A16 16 0 0 1 14 90 V30 A16 16 0 0 1 30 14 Z';

type WindleMarkProps = Omit<ComponentPropsWithRef<'svg'>, 'children'> & {
  /** Edge length in CSS px (width and height attributes; a `size-*` class overrides it). */
  size?: number;
  /** True when the mark sits next to the "windle" wordmark or inside a labelled control: hidden from assistive tech. */
  decorative?: boolean;
};

export function WindleMark({ size = 32, decorative = false, className, ...props }: WindleMarkProps) {
  const a11y = decorative
    ? ({ 'aria-hidden': true, focusable: false } as const)
    : ({ role: 'img', 'aria-label': 'windle' } as const);
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: named via aria-label (role=img), or aria-hidden when decorative
    <svg
      data-windle-mark
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="currentColor"
      className={cn('shrink-0 text-accent', className)}
      {...a11y}
      {...props}
    >
      <path d={WINDLE_MARK_PATH} />
    </svg>
  );
}
