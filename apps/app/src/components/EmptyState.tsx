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
    <section className="flex flex-col items-start gap-4 rounded-lg border border-(--hairline) bg-surface p-5 sm:p-6">
      <WindleMark decorative size={28} className="text-muted-foreground" />
      <div className="flex max-w-prose flex-col gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
      {action}
    </section>
  );
}
