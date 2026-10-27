import type { ReactNode } from 'react';

type Props = {
  label: string;
  description?: string | undefined;
  children: ReactNode;
  /** Control under the text instead of at its right: for lists and long content. */
  stacked?: boolean;
};

export function SettingRow({ label, description, children, stacked = false }: Props) {
  return (
    <div
      data-setting-row
      className={`flex gap-x-6 gap-y-3 border-b border-(--hairline) py-2.5 last:border-b-0 ${
        stacked ? 'flex-col' : 'flex-wrap items-center justify-between'
      }`}
    >
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="text-xs leading-snug text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      <div className={stacked ? 'min-w-0' : 'flex max-w-full min-w-0 shrink-0 items-center gap-2'}>{children}</div>
    </div>
  );
}
