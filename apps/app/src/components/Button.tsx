import type { ComponentPropsWithRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ComponentPropsWithRef<'button'> & { variant?: Variant };

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-pill px-6 text-sm font-semibold tracking-wide transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-(--ease-standard) active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-foreground enabled:hover:bg-accent-hover',
  secondary:
    'border border-border-strong/60 bg-transparent text-foreground enabled:hover:border-border-accent enabled:hover:bg-surface-navy-raised/60',
  ghost: 'text-muted-foreground enabled:hover:text-foreground',
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`${base} ${variants[variant]} ${className ?? ''}`} {...props} />;
}

type LinkButtonProps = ComponentPropsWithRef<'a'> & { variant?: Variant };

export function LinkButton({ variant = 'primary', className, ...props }: LinkButtonProps) {
  return <a className={`${base} ${variants[variant]} ${className ?? ''}`} {...props} />;
}
