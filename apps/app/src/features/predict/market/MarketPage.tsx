import { Link, useParams } from 'react-router';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { useMediaQuery } from '@/lib/media';
import { isNotFound } from '../errors';
import { useMarketDetail } from '../hooks';
import { MarketChartCard } from './MarketChartCard';
import { MarketHeader } from './MarketHeader';
import { MarketTabs } from './MarketTabs';
import { MarketTopBar } from './MarketTopBar';
import { MarketTweet } from './MarketTweet';
import { TradePanel } from './TradePanel';
import { TradeSheet } from './TradeSheet';

const columns = 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]';

function NotFound({ slug }: { slug: string }) {
  return (
    <div data-market-not-found className="flex flex-col items-start gap-4">
      <title>Market not found — windle</title>
      <h1 className="text-2xl font-semibold">Market not found</h1>
      <p className="max-w-prose text-muted-foreground">
        Nothing is listed under “{slug}”. The link may be wrong, or the market was removed.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent px-4 text-xs font-semibold text-accent-foreground transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-hover active:translate-y-px"
      >
        Browse markets
      </Link>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-hidden="true" data-market-skeleton className="flex flex-col gap-4">
      <div className={columns}>
        <div className="h-[36rem] rounded-lg bg-muted/40 motion-safe:animate-pulse" />
        <div className="hidden h-[36rem] rounded-lg bg-muted/30 motion-safe:animate-pulse lg:block" />
      </div>
      <div className="h-48 rounded-lg bg-muted/30 motion-safe:animate-pulse" />
    </div>
  );
}

export function MarketPage() {
  const { slug = '' } = useParams();
  const query = useMarketDetail(slug);
  const wide = useMediaQuery('(min-width: 64rem)');
  const market = query.data?.market;

  if (!market) {
    if (query.isPending) {
      return (
        <>
          <title>Market — windle</title>
          <span role="status" className="sr-only">
            Loading the market…
          </span>
          <PageSkeleton />
        </>
      );
    }
    if (isNotFound(query.error)) return <NotFound slug={slug} />;
    return <ApiUnavailable error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  return (
    <div data-market-page className={wide ? '' : 'pb-24'}>
      <title>{`${market.statement} — windle`}</title>
      <MarketTopBar />
      <div className="flex flex-col gap-4">
        <div className={columns}>
          <div className="flex min-w-0 flex-col divide-y divide-(--hairline) rounded-lg border border-(--hairline) bg-surface">
            <MarketHeader market={market} />
            <MarketChartCard market={market} />
          </div>
          {wide ? (
            <aside aria-label="Trading" className="flex flex-col">
              <TradePanel market={market} />
            </aside>
          ) : null}
        </div>
        <div className={columns}>
          <div className="min-w-0 rounded-lg border border-(--hairline) bg-surface">
            <MarketTabs market={market} hidePayout={wide && market.status !== 'open'} />
          </div>
          {market.source ? <MarketTweet source={market.source} className="h-full" /> : null}
        </div>
      </div>
      {wide ? null : <TradeSheet market={market} />}
    </div>
  );
}
