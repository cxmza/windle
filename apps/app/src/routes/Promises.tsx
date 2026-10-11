import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { PageHeading } from '@/components/PageHeading';

export function Promises() {
  return (
    <>
      <PageHeading title="Promises" lede="Every promise you make, with where it stands." />
      <EmptyState title="No promises yet" action={<Button disabled>Make a promise — coming soon</Button>}>
        <p>Promises you make will be listed here, newest first, with their status and what is behind them.</p>
      </EmptyState>
    </>
  );
}
