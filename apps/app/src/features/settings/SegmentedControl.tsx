import { ToggleGroup } from 'radix-ui';
import type { ReactNode } from 'react';

type Option<T extends string> = { value: T; label: string; icon?: ReactNode };

type Props<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly Option<T>[];
  label: string;
  disabled?: boolean;
};

// The selected state is a plain background and a box-shadow edge: no measuring, no sliding indicator, no size change,
// so a click repaints in the same frame and moves nothing.
const item =
  'relative inline-flex h-6 min-w-14 items-center justify-center rounded-sm px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-(--selected) data-[state=on]:text-foreground max-md:h-9 [@media(hover:hover)]:enabled:hover:text-foreground [@media(hover:hover)]:data-[state=off]:enabled:hover:bg-(--hover) active:enabled:bg-(--selected)';

export function SegmentedControl<T extends string>({ value, onValueChange, options, label, disabled }: Props<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      disabled={disabled}
      aria-label={label}
      onValueChange={(next) => {
        const match = options.find((o) => o.value === next);
        if (match) onValueChange(match.value);
      }}
      className="inline-flex gap-0.5 rounded-md border border-(--control-border) bg-background p-0.5"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          aria-label={o.icon ? o.label : undefined}
          title={o.icon ? o.label : undefined}
          className={o.icon ? `${item} min-w-9 px-2` : item}
        >
          {o.icon ?? o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
