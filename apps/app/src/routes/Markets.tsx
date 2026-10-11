import { EmptyState } from '@/components/EmptyState';
import { PageHeading } from '@/components/PageHeading';

export function Markets() {
  return (
    <>
      <PageHeading title="Markets" lede="Where people take a side on whether a promise gets kept." />
      <EmptyState title="No open markets">
        <p>
          A market is attached to a promise. Others can back it or bet against it, and the verdict settles the outcome.
          Markets will appear here once promises are live.
        </p>
      </EmptyState>
    </>
  );
}
