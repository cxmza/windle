import { WindleMark } from '@windle/brand';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';
import { useLogoJelly } from './use-jelly';

type WindleLogoProps = ComponentPropsWithRef<'span'> & {
  /** Mark edge length in CSS px. */
  markSize?: number;
  /** Extra classes for the wordmark (e.g. `max-lg:sr-only`: mark only on narrow bars). */
  wordmarkClassName?: string;
  /** When this changes after mount (e.g. the active chapter) the mark does a small classic. */
  nudgeKey?: unknown;
};

/** Lockup: the mark plus the lowercase "windle" wordmark in the display font. The wordmark is the accessible name. */
export function WindleLogo({ markSize = 24, className, wordmarkClassName, nudgeKey, ...props }: WindleLogoProps) {
  // logo jelly (character): classic on hover/click, drag-to-stretch; static under reduced motion
  const jellyRef = useLogoJelly<SVGSVGElement>(nudgeKey);
  return (
    <span data-windle-logo className={cn('inline-flex items-center gap-2', className)} {...props}>
      <WindleMark ref={jellyRef} decorative data-logo-jelly size={markSize} />
      <span
        className={cn(
          'font-display text-base font-black leading-none tracking-tight text-foreground lowercase',
          wordmarkClassName,
        )}
      >
        windle
      </span>
    </span>
  );
}
