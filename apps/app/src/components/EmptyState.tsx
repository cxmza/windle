import { WindleMark } from '@windle/brand';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  /** Primary action or a "coming soon" placeholder. */
  action?: ReactNode;
};

/** A deliberate empty state: a quiet outline mark, one sentence of what goes here, and the next step. */
export function EmptyState({ title, children, action }: Props) {
  return (
    <section className="glass flex flex-col items-start gap-5 rounded-3xl p-6 sm:p-8">
      <WindleMark decorative size={44} className="text-accent-text/60" />
      <div className="flex max-w-prose flex-col gap-2">
        <h2 className="font-display text-lg font-bold lowercase tracking-tight">{title}</h2>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
      {action}
    </section>
  );
}
