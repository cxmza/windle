import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';

type CtaLinkProps = ComponentPropsWithRef<'a'> & {
  variant?: 'primary' | 'ghost';
};

export function CtaLink({ variant = 'primary', className, ...props }: CtaLinkProps) {
  return (
    <a
      data-variant={variant}
      data-sketch-target="cta"
      className={cn(
        'inline-flex min-h-12 items-center justify-center rounded-pill border border-border-strong px-7 text-caption font-semibold uppercase tracking-[0.08em] transition-colors duration-(--dur-fast) ease-standard active:scale-[0.98]',
        'data-[variant=primary]:bg-emphasis data-[variant=primary]:text-emphasis-foreground',
        'data-[variant=ghost]:bg-caption data-[variant=ghost]:text-caption-foreground data-[variant=ghost]:backdrop-blur-md',
        // primary CTA: white block, electric blue on hover (white on blue 5.0:1)
        '[@media(hover:hover)]:data-[variant=primary]:hover:border-border-accent [@media(hover:hover)]:data-[variant=primary]:hover:bg-accent [@media(hover:hover)]:data-[variant=primary]:hover:text-accent-foreground',
        // glow bloom (feedback): a static shadow-glow halo on ::before that blooms in by opacity + scale 0.96 -> 1,
        // on hover and keyboard focus alike; reduced motion keeps only the opacity fade
        'relative before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:opacity-0 before:shadow-glow before:scale-96 before:transition-[opacity,scale] before:duration-(--dur-base) before:ease-decelerate motion-reduce:before:scale-100',
        'data-[variant=primary]:focus-visible:before:opacity-100 data-[variant=primary]:focus-visible:before:scale-100 [@media(hover:hover)]:data-[variant=primary]:hover:before:opacity-100 [@media(hover:hover)]:data-[variant=primary]:hover:before:scale-100',
        '[@media(hover:hover)]:data-[variant=ghost]:hover:bg-emphasis [@media(hover:hover)]:data-[variant=ghost]:hover:text-emphasis-foreground',
        'aria-disabled:pointer-events-none aria-disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}
