export const card = 'rounded-lg border border-(--hairline) bg-surface p-4 [[data-density=compact]_&]:p-3';

export const sectionTitle = 'text-sm font-semibold text-foreground';

export const kicker = 'text-[0.6875rem] font-medium tracking-[0.06em] text-muted-foreground uppercase';

export const sideTone = {
  yes: 'text-(--yes)',
  no: 'text-(--no)',
} as const;

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export const subtleButton =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-(--control-border) px-3 text-xs font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:enabled:bg-(--selected) disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)]:enabled:hover:bg-(--hover)';

export const pill =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap';
