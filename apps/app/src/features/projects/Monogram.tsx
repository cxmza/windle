type Size = 'sm' | 'md' | 'lg';

const box: Record<Size, string> = {
  sm: 'size-9 text-sm',
  md: 'size-11 text-base',
  lg: 'size-16 text-2xl md:size-20 md:text-3xl',
};

export function Monogram({ name, size = 'md' }: { name: string; size?: Size }) {
  return (
    <span
      aria-hidden="true"
      data-monogram
      className={`inline-flex shrink-0 items-center justify-center rounded-[30%] border border-(--hairline) bg-linear-to-b from-surface-raised to-surface font-display font-bold text-foreground shadow-[inset_0_1px_0_var(--nav-sheen-top)] select-none ${box[size]}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
