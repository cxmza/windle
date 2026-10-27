import { Tooltip } from 'radix-ui';
import type { ReactElement } from 'react';

type Props = { label: string; active: boolean; children: ReactElement };

/** In the icon rail the label lives in a tooltip; in the full sidebar the child is returned untouched. */
export function RailTip({ label, active, children }: Props) {
  if (!active) return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={10}
          className="z-(--z-pencil) rounded-md border border-(--hairline) bg-(--panel-surface) px-2.5 py-1.5 text-xs font-medium text-foreground"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
