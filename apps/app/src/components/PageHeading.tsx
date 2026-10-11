import type { ReactNode } from 'react';

type Props = { title: string; lede?: ReactNode };

/** Every page: document title (React 19 hoists <title>), one h1, one calm lede. */
export function PageHeading({ title, lede }: Props) {
  return (
    <header className="flex flex-col gap-2">
      <title>{`${title} — windle`}</title>
      <h1 className="font-display text-split font-black lowercase">{title}</h1>
      {lede ? <p className="max-w-prose text-lede text-muted-foreground">{lede}</p> : null}
    </header>
  );
}
