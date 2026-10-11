import type { ComponentPropsWithRef, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

type PillProps = {
  variant?: Variant;
  /** `lead`: starts with an icon badge (badge sits concentric with the curve). `compact`: narrow cell of a row. */
  inset?: 'default' | 'lead' | 'compact';
};

type ButtonProps = ComponentPropsWithRef<'button'> & PillProps;

/** Soft full-width pill: optional icon badge / label on the left, arrow on the right (via children). Focus ring follows the radius. */
const base =
  'flex h-14 w-full items-center rounded-full text-left font-medium leading-none transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-(--ease-standard) active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 aria-busy:cursor-progress';

const variants: Record<Variant, string> = {
  primary:
    'border border-transparent bg-foreground text-background hover:bg-foreground/85 aria-busy:hover:bg-foreground',
  secondary:
    'border border-foreground/12 bg-foreground/6 text-foreground enabled:hover:bg-foreground/12 aria-busy:hover:bg-foreground/6',
};

const INSETS = {
  default: 'gap-3 px-6 text-base',
  lead: 'gap-3 pl-3 pr-6 text-base',
  compact: 'gap-2.5 px-4 text-sm sm:px-3.5',
} as const;

export function Button({ variant = 'primary', inset = 'default', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={`${base} ${INSETS[inset]} ${variants[variant]} ${className ?? ''}`} {...props} />
  );
}

type LinkButtonProps = ComponentPropsWithRef<'a'> & PillProps;

export function LinkButton({ variant = 'primary', inset = 'default', className, ...props }: LinkButtonProps) {
  const hover = variant === 'secondary' ? 'hover:bg-foreground/12' : '';
  return <a className={`${base} ${INSETS[inset]} ${variants[variant]} ${hover} ${className ?? ''}`} {...props} />;
}

/** Small circle holding a wallet / provider icon at the left end of a pill. */
export function IconBadge({ variant = 'primary', children }: { variant?: Variant; children: ReactNode }) {
  const tone = variant === 'primary' ? 'bg-background/10' : 'bg-foreground/10';
  return (
    <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone}`}>
      {children}
    </span>
  );
}
