import type { ComponentPropsWithRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

type Size = 'md' | 'sm';

type ButtonProps = ComponentPropsWithRef<'button'> & { variant?: Variant; size?: Size };

const base =
  'inline-flex items-center justify-center gap-2 rounded-md text-xs font-semibold transition-[background-color,border-color,color] duration-(--dur-instant) ease-(--ease-standard) active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50';

const sizes: Record<Size, string> = { md: 'min-h-9 px-4', sm: 'min-h-8 px-3' };

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-foreground not-disabled:hover:bg-accent-hover',
  secondary:
    'border border-(--control-border) bg-transparent text-foreground not-disabled:hover:border-border-strong not-disabled:hover:bg-(--hover)',
  ghost: 'text-muted-foreground not-disabled:hover:bg-(--hover) not-disabled:hover:text-foreground',
};

/** The button look for anything that is not a <button>, e.g. a router <Link>. */
export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className = ''): string =>
  `${base} ${sizes[size]} ${variants[variant]} ${className}`;

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentPropsWithRef<'a'> & { variant?: Variant; size?: Size };

export function LinkButton({ variant = 'primary', size = 'md', className, ...props }: LinkButtonProps) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}
