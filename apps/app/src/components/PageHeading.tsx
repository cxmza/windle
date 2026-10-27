import type { ReactNode } from 'react';

type Props = { title: string; lede?: ReactNode };

/** Every page: document title (React 19 hoists <title>), one h1, one calm lede. */
export function PageHeading({ title, lede }: Props) {
  return (
    <header className="flex flex-col gap-1">
      <title>{`${title} — windle`}</title>
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
      {lede ? <p className="max-w-prose text-sm text-muted-foreground">{lede}</p> : null}
    </header>
  );
}
