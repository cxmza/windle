import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { PageHeading } from '@/components/PageHeading';

const STEPS = [
  ['Promise', 'You state what you will do, and by when.'],
  ['Collateral', 'You put something behind your word.'],
  ['Market', 'Others can take a side on whether you keep it.'],
  ['Verdict', 'The outcome settles it, for everyone.'],
] as const;

export function Dashboard() {
  return (
    <>
      <PageHeading title="Dashboard" lede="Everything you have promised, in one place." />

      {/* TODO(motion): staggered entrance for the empty state and the steps */}
      <EmptyState
        title="Your promises"
        action={
          <Button disabled aria-describedby="promise-soon">
            Make a promise — coming soon
          </Button>
        }
      >
        <p>
          Nothing here yet. Once promises open, yours will show up with their collateral, their market and the verdict.
        </p>
        <p id="promise-soon" className="sr-only">
          Making promises is not available yet.
        </p>
      </EmptyState>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="text-kicker font-semibold uppercase text-muted-foreground">
          How it works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(([name, text], i) => (
            <li key={name} className="flex flex-col gap-2 rounded-2xl border border-border-strong/25 bg-surface/40 p-4">
              <span className="font-mono text-caption text-accent-text">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-display text-sm font-bold lowercase">{name}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
