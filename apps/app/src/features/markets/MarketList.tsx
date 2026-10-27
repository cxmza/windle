import { type ApiMarket, SIDE_LABELS } from '@windle/shared';
import { LazyMotion, m as motion } from 'motion/react';
import { Tabs } from 'radix-ui';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { buttonClass } from '@/components/Button';
import { Monogram } from '@/components/Monogram';
import { OddsNumber, OddsUnit } from '@/components/OddsNumber';
import { SearchField } from '@/components/SearchField';
import { usePrefetchMarket } from '@/features/media/prefetch';
import { usePref } from '@/features/settings/prefs';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { formatDate } from '@/lib/format';
import { useReducedMotion } from '@/lib/media';
import { calmSpring, loadMaxFeatures } from '@/lib/motion';
import { oddsText, oddsUnit } from '@/lib/odds';
import { probToPercent } from '../predict/format';
import { useMarkets } from '../predict/hooks';
import { ShareMenu } from '../predict/ShareMenu';
import { Amount } from '../predict/ui/Amount';
import { MarketStatusBadge } from '../predict/ui/MarketStatusBadge';
import { TierBadge } from '../predict/ui/TierBadge';
import { DeadlineValue } from './DeadlineValue';
import { ListSkeleton, MarketsEmpty } from './MarketsEmpty';
import {
  defaultSort,
  GROUP_LABELS,
  GROUP_QUERY,
  matchesQuery,
  parseGroup,
  parseSort,
  parseTier,
  SORT_OPTIONS,
  STATUS_GROUPS,
  type StatusGroup,
  TIER_TABS,
  type TierTab,
  tierOf,
} from './market-index';
import { OddsBlade } from './OddsBlade';
import { QuickBet } from './QuickBet';

const TAB_LABELS: Record<TierTab, string> = { all: 'All', community: 'Community', backed: 'Backed' };

function onListKey(e: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>('[data-row-link]')];
  const i = rows.indexOf(document.activeElement as HTMLAnchorElement);
  if (i < 0) return;
  e.preventDefault();
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
  rows[next]?.focus();
}

const th =
  'sticky top-(--menu-clearance) z-10 h-8 border-b border-(--hairline) bg-background px-3 text-[0.6875rem] font-medium tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase first:pl-4 last:pr-4 md:first:pl-6 md:last:pr-6';
const td = 'px-3 py-0 align-middle first:pl-4 last:pr-4 md:first:pl-6 md:last:pr-6';
const num = 'text-right font-mono text-[0.8125rem] tabular-nums';
const colMd = 'hidden @md:table-cell';
const colLg = 'hidden @3xl:table-cell';
const colXl = 'hidden @3xl:table-cell';
const colStatus = 'hidden @5xl:table-cell';

type RowProps = {
  market: ApiMarket;
  index: number;
  now: number;
  /** Rows of the first paint stagger in; rows that arrive with a filter change just fade in. */
  stagger: boolean;
  /** Changes whenever the order changes, so rows measure for the reflow only then. */
  order: string;
  reflow: boolean;
};

function Row({ market: m, index, now, stagger, order, reflow }: RowProps) {
  const settled = m.status === 'resolved' || m.status === 'voided';
  const pct = probToPercent(m.probYes);
  const format = usePref('odds');
  const [delay] = useState(stagger ? index : 0);
  const prefetch = usePrefetchMarket();
  return (
    <motion.tr
      data-market-row
      layout={reflow ? 'position' : false}
      layoutDependency={order}
      transition={calmSpring('--dur-base', 260)}
      style={{ '--i': delay } as CSSProperties}
      className="relative h-12 border-b border-(--hairline) transition-colors [[data-density=compact]_&]:h-10 duration-(--dur-instant) ease-(--ease-standard) has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-ring active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)"
    >
      <td className={td}>
        <span className="flex min-w-0 items-center gap-3">
          <span className="max-sm:hidden">
            <Monogram name={m.project.name} size="sm" image={m.image} />
          </span>
          <Link
            to={`/m/${m.slug}`}
            data-row-link
            onPointerEnter={() => prefetch(m)}
            onFocus={() => prefetch(m)}
            title={m.statement}
            className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-foreground outline-none after:absolute after:inset-0 after:content-['']"
          >
            {m.statement}
          </Link>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="sr-only">{m.project.name}</span>
            <span className="font-mono font-semibold text-accent-text">${m.project.ticker}</span>
            <span className="hidden @3xl:inline-flex">
              <TierBadge tier={m.tier} />
            </span>
            {m.status === 'open' ? (
              <span className="hidden font-mono @md:inline @3xl:hidden">
                <DeadlineValue deadline={m.deadline} now={now} />
              </span>
            ) : null}
          </span>
        </span>
      </td>

      <td className={`${td} ${num} ${colMd}`}>
        <span className={`flex items-baseline justify-end gap-2 ${settled ? 'opacity-60' : ''}`}>
          <span className="text-(--yes)">
            <OddsNumber value={pct} />
            <OddsUnit />
            <span className="sr-only"> odds: {SIDE_LABELS[m.tier].yes}</span>
          </span>
          <span className="text-xs text-(--no)">
            {oddsText(100 - pct, format)}
            {oddsUnit(format)}
            <span className="sr-only"> odds: {SIDE_LABELS[m.tier].no}</span>
          </span>
        </span>
        <OddsBlade value={pct} className="mt-1 w-full" />
      </td>

      <td className={`${td} ${num} ${colLg}`}>
        <Amount value={m.volumePts} format="compact" className="justify-end" />
        <span className="sr-only"> volume</span>
      </td>

      <td className={`${td} ${num} ${colXl}`}>
        {m.traders.toLocaleString('en')}
        <span className="sr-only"> traders</span>
      </td>

      <td className={`${td} ${num} ${colLg}`}>
        {m.status === 'open' ? (
          <DeadlineValue deadline={m.deadline} now={now} srLeft />
        ) : (
          <span className="font-sans text-muted-foreground">{formatDate(m.deadline)}</span>
        )}
      </td>

      <td className={`${td} ${colStatus}`}>
        <MarketStatusBadge market={m} />
      </td>

      <td className={`${td} text-right`}>
        <span className="flex items-center justify-end gap-1">
          <QuickBet market={m} now={now} />
          <ShareMenu market={m} variant="icon" />
        </span>
      </td>
    </motion.tr>
  );
}

const countClass = 'ml-1.5 inline-block min-w-[2ch] text-left font-mono text-xs tabular-nums text-muted-foreground';

const tabClass =
  'relative -mb-px inline-flex h-12 items-center border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) data-[state=active]:border-border-accent data-[state=active]:text-foreground active:bg-(--selected) [@media(hover:hover)]:hover:text-foreground';

type ListProps = {
  now: number;
  /** Extra header controls beside "New market". */
  actions?: ReactNode;
  /** Brings the X feed into view when it is not already on screen; the empty state offers it. */
  onShowFeed?: (() => void) | undefined;
};

export function MarketList({ now, actions, onShowFeed }: ListProps) {
  const [params, setParams] = useSearchParams();
  const tier = parseTier(params.get('tier'));
  const group = parseGroup(params.get('status'));
  const sort = parseSort(params.get('sort'), group);
  const q = params.get('q') ?? '';

  const query = useMarkets({ status: GROUP_QUERY[group], sort }, { poll: true });
  const scoped = query.markets.filter((m) => matchesQuery(m, q));
  const shown = tier === 'all' ? scoped : scoped.filter((m) => m.tier === tierOf(tier));
  const counts: Record<TierTab, number> = {
    all: scoped.length,
    community: scoped.filter((m) => m.tier === 'community').length,
    backed: scoped.filter((m) => m.tier === 'backed').length,
  };
  const reflow = !useReducedMotion();
  const order = shown.map((m) => m.id).join(' ');
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (shown.length > 0) setPainted(true);
  }, [shown.length]);
  const filtered = q.trim() !== '' || tier !== 'all' || group !== 'open' || params.has('sort');

  const update = (patch: { tier?: TierTab; status?: StatusGroup; sort?: string; q?: string }) => {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string, fallback: string) => {
      if (value && value !== fallback) next.set(key, value);
      else next.delete(key);
    };
    if (patch.tier !== undefined) set('tier', patch.tier, 'all');
    if (patch.status !== undefined) {
      set('status', patch.status, 'open');
      next.delete('sort');
    }
    if (patch.sort !== undefined) set('sort', patch.sort, defaultSort(patch.status ?? group));
    if (patch.q !== undefined) set('q', patch.q, '');
    setParams(next, { replace: true });
  };

  const list = (
    <section aria-label="Markets" aria-busy={query.isPending} className="flex flex-col">
      <p role="status" className="sr-only">
        {query.isPending
          ? 'Loading markets'
          : `${shown.length} ${shown.length === 1 ? 'market' : 'markets'} ${GROUP_LABELS[group].toLowerCase()}${tier === 'all' ? '' : `, ${TAB_LABELS[tier].toLowerCase()}`}`}
      </p>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && query.markets.length === 0 ? (
        <div className="px-4 py-8 md:px-6">
          <ApiUnavailable error={query.error} onRetry={query.refetch} retrying={false} />
        </div>
      ) : shown.length === 0 ? (
        filtered ? (
          <div className="flex flex-col items-start gap-3 border-t border-(--hairline) px-4 py-8 md:px-6">
            <p className="text-sm text-foreground">
              {q.trim() !== ''
                ? `No ${GROUP_LABELS[group].toLowerCase()} markets match “${q.trim()}”.`
                : `No ${GROUP_LABELS[group].toLowerCase()} markets here.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setParams(new URLSearchParams(), { replace: true })}
                className={buttonClass('secondary', 'sm')}
              >
                Clear filters
              </button>
              <Link to="/create" className={buttonClass('ghost', 'sm')}>
                Create a market
              </Link>
            </div>
          </div>
        ) : (
          <MarketsEmpty onShowFeed={onShowFeed} />
        )
      ) : (
        <LazyMotion features={loadMaxFeatures}>
          <table aria-label="Market list" className="w-full table-fixed border-separate border-spacing-0">
            <thead>
              <tr>
                <th scope="col" className={`${th} text-left`}>
                  Market
                </th>
                <th scope="col" className={`${th} w-28 text-right ${colMd}`}>
                  Odds
                </th>
                <th scope="col" className={`${th} w-36 text-right ${colLg}`}>
                  Volume (practice)
                </th>
                <th scope="col" className={`${th} w-16 text-right ${colXl}`}>
                  Traders
                </th>
                <th scope="col" className={`${th} w-32 text-right ${colLg}`}>
                  {group === 'open' ? 'Closes' : 'Closed'}
                </th>
                <th scope="col" className={`${th} w-40 text-left ${colStatus}`}>
                  Status
                </th>
                <th scope="col" className={`${th} w-40 text-right`}>
                  <span className="sr-only">Quick bet and share</span>
                </th>
              </tr>
            </thead>
            <tbody onKeyDown={onListKey}>
              {shown.map((m, i) => (
                <Row key={m.id} market={m} index={i} now={now} stagger={!painted} order={order} reflow={reflow} />
              ))}
            </tbody>
          </table>
        </LazyMotion>
      )}
      {query.hasMore ? (
        <div className="flex justify-center border-t border-(--hairline) px-4 py-4">
          <button
            type="button"
            disabled={query.loadingMore}
            onClick={query.loadMore}
            className={buttonClass('secondary', 'sm')}
          >
            {query.loadingMore ? 'Loading…' : `Show more (${Math.max(0, query.total - query.markets.length)} left)`}
          </button>
        </div>
      ) : null}
    </section>
  );

  return (
    <Tabs.Root value={tier} onValueChange={(v) => update({ tier: parseTier(v) })} className="flex flex-col">
      <header className="flex flex-wrap items-center gap-x-6 border-b border-(--hairline) px-4 md:px-6">
        <h1 className="py-2 text-xl font-semibold tracking-[-0.01em]">Markets</h1>
        <Tabs.List aria-label="Market tier" className="flex min-w-0 gap-1">
          {TIER_TABS.map((t) => (
            <Tabs.Trigger key={t} value={t} className={tabClass}>
              {TAB_LABELS[t]}
              <span className={countClass}>{counts[t]}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="ml-auto flex items-center gap-2 py-2">
          {actions}
          <Link to="/create" className={buttonClass('primary', 'sm')}>
            New market
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-(--hairline) px-4 py-2 md:px-6">
        <p className="basis-full truncate text-xs text-muted-foreground sm:min-w-16 sm:flex-1 sm:basis-0">
          Practice points · no real value
        </p>
        <SegmentedControl<StatusGroup>
          label="Status"
          value={group}
          onValueChange={(v) => update({ status: v })}
          options={STATUS_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] }))}
        />
        <SearchField
          value={q}
          label="Search markets"
          onChange={(v) => update({ q: v })}
          className="min-w-0 flex-1 sm:w-40 sm:flex-none"
        />
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-(--control-border) pl-2.5 text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="h-7 cursor-pointer rounded-md bg-transparent pr-1 pl-0.5 text-xs font-medium text-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-background text-foreground">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {TIER_TABS.map((t) => (
        <Tabs.Content key={t} value={t} className="outline-offset-4">
          {list}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
