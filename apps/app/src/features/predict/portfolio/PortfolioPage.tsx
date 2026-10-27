import { useState } from 'react';
import { Link } from 'react-router';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { buttonClass } from '@/components/Button';
import { PageHeading } from '@/components/PageHeading';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { formatPts } from '../format';
import { usePortfolio } from '../hooks';
import { PositionsTable } from './PositionsTable';
import { type PositionFilter, positionRows } from './rows';
import { Summary } from './Summary';
import { TradeHistory } from './TradeHistory';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'settled', label: 'Settled' },
] as const satisfies readonly { value: PositionFilter; label: string }[];

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="h-20 rounded-lg bg-muted/40 motion-safe:animate-pulse" />
      <div className="h-56 rounded-lg bg-muted/30 motion-safe:animate-pulse" />
    </div>
  );
}

export function PortfolioPage() {
  const query = usePortfolio({ poll: true });
  const [filter, setFilter] = useState<PositionFilter>('open');
  const portfolio = query.data;

  const heading = (
    <PageHeading
      title="Portfolio"
      lede="Your positions, results and history across every market. Practice points, no real value."
    />
  );

  if (!portfolio) {
    return (
      <>
        {heading}
        {query.isError ? (
          <ApiUnavailable error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : (
          <>
            <span role="status" className="sr-only">
              Loading your portfolio…
            </span>
            <Skeleton />
          </>
        )}
      </>
    );
  }

  const rows = positionRows(portfolio.positions, filter);
  const counts = {
    open: positionRows(portfolio.positions, 'open').length,
    settled: positionRows(portfolio.positions, 'settled').length,
  };
  const empty = portfolio.positions.length === 0 && portfolio.history.length === 0;

  return (
    <>
      {heading}

      <Summary portfolio={portfolio} />

      {empty ? (
        <section
          aria-labelledby="empty-title"
          className="flex max-w-xl flex-col items-start gap-4 rounded-2xl border border-(--hairline) bg-surface p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h2 id="empty-title" className="text-lg font-semibold text-foreground">
              No positions yet
            </h2>
            <p className="text-sm text-muted-foreground">
              You start with {formatPts(portfolio.startingBalancePts)} practice points. Take a side on a promise, or
              open a market from a tweet.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/" className={buttonClass('primary', 'md')}>
              Browse markets
            </Link>
            <Link to="/create" className={buttonClass('secondary', 'md')}>
              Create a market
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="positions-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="positions-title" className="text-base font-semibold text-foreground">
                Positions
              </h2>
              <SegmentedControl<PositionFilter>
                label="Filter positions"
                value={filter}
                onValueChange={setFilter}
                options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} ${counts[f.value]}` }))}
              />
            </div>
            {rows.length > 0 ? (
              <PositionsTable rows={rows} />
            ) : (
              <div
                data-rise="fade"
                className="flex flex-col items-start gap-3 rounded-xl border border-(--hairline) bg-surface p-5"
              >
                <p className="text-sm text-muted-foreground">
                  {filter === 'open' ? 'No open positions.' : 'Nothing has settled yet. Payouts arrive on their own.'}
                </p>
                {filter === 'open' ? (
                  <Link to="/" className={buttonClass('secondary', 'sm')}>
                    Browse markets
                  </Link>
                ) : null}
              </div>
            )}
          </section>

          <section aria-labelledby="history-title" className="flex flex-col gap-3">
            <h2 id="history-title" className="text-base font-semibold text-foreground">
              Trade history
            </h2>
            {portfolio.history.length > 0 ? (
              <TradeHistory trades={portfolio.history} markets={portfolio.markets} />
            ) : (
              <p className="rounded-xl border border-(--hairline) bg-surface p-5 text-sm text-muted-foreground">
                No trades yet.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
