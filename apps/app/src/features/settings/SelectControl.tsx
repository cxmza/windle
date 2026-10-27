import { Select } from 'radix-ui';
import { CheckIcon, ChevronDownIcon } from '@/shell/icons';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly Option<T>[];
  label: string;
  disabled?: boolean;
};

const trigger =
  'inline-flex h-8 w-52 items-center justify-between gap-3 rounded-md border border-(--control-border) bg-background px-3 text-sm text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-(--hover) max-md:h-11 active:enabled:bg-(--selected) [@media(hover:hover)]:enabled:hover:bg-(--hover)';

const item =
  'flex h-8 cursor-default items-center justify-between gap-3 rounded-md px-2.5 text-sm text-foreground outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-(--hover) max-md:h-11';

export function SelectControl<T extends string>({ value, onValueChange, options, label, disabled }: Props<T>) {
  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const match = options.find((o) => o.value === next);
        if (match) onValueChange(match.value);
      }}
    >
      <Select.Trigger aria-label={label} className={trigger}>
        <span className="min-w-0 truncate">
          <Select.Value>{options.find((o) => o.value === value)?.label}</Select.Value>
        </span>
        <Select.Icon className="text-muted-foreground">
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          data-popover
          className="z-(--z-pencil) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) rounded-lg border border-(--control-border) bg-surface-raised p-1"
        >
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value} className={item}>
                <Select.ItemText>{o.label}</Select.ItemText>
                <span className="inline-flex size-4.5 shrink-0 items-center justify-center">
                  <Select.ItemIndicator>
                    <CheckIcon />
                  </Select.ItemIndicator>
                </span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
