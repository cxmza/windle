import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Digits } from '@/components/Digits';
import { OddsNumber } from '@/components/OddsNumber';
import { useClock } from '@/lib/clock';
import { useLiveDriver } from '../live/use-live';
import { countdown, formatSol } from '../markets/format';
import { OddsBlade } from '../markets/OddsBlade';
import { StatusPill } from '../markets/StatusPill';
import type { MarketStatus } from '../markets/types';
import { SearchField, StatusFilter } from './Filters';
import { formatDate } from './format';
import { LiveDot } from './LiveDot';
import { Monogram } from './Monogram';
import { parseSort, parseStatuses, projectPath, selectProjects, serializeStatuses, trackRecord } from './model';
import { ProjectsFrame } from './ProjectsFrame';
import { RecordLabel } from './RecordLabel';
import { fixtureProjectsSource, projectsQuery } from './source';
import { type Project, type ProjectSort, SORTS } from './types';

const cols = 'md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_7rem_6.5rem_7.5rem]';

function timeCell(p: Project, now: number) {
  const m = p.current;
  if (m.status === 'live') {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-sm tabular-nums">
        <LiveDot />
        <Digits text={countdown(m.deadline, now)} dir="down" />
        <span className="sr-only"> left</span>
      </span>
    );
  }
  if (m.status === 'settling') return <span className="text-sm text-muted-foreground">check running</span>;
  return <span className="text-sm text-muted-foreground tabular-nums">{formatDate(m.deadline)}</span>;
}

function Row({ p, index, now }: { p: Project; index: number; now: number }) {
  const m = p.current;
  const resolved = m.status === 'shipped' || m.status === 'slashed';
  return (
    <li data-project-row style={{ '--i': index + 3 } as CSSProperties} className="border-b border-(--hairline)">
      <Link
        to={projectPath(p.slug)}
        className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 rounded-3xl px-3 py-5 transition-colors duration-(--dur-instant) ease-(--ease-standard) md:px-4 md:pr-11 ${cols} [@media(hover:hover)]:hover:bg-(--nav-hover)`}
      >
        <span
          aria-hidden="true"
          data-row-arrow
          className="absolute top-1/2 right-4 -mt-2.5 text-base leading-5 text-muted-foreground max-md:hidden"
        >
          →
        </span>
        <span className="flex min-w-0 items-center gap-3.5 md:col-start-1 md:row-start-1">
          <Monogram name={p.name} size="md" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-base font-semibold">{p.name}</span>
              <span className="text-xs font-semibold tracking-[0.12em] text-accent-text">${p.ticker}</span>
            </span>
            <RecordLabel record={trackRecord(p)} />
          </span>
        </span>

        <span className="flex flex-col items-end gap-1.5 md:col-start-5 md:row-start-1">
          <StatusPill status={m.status} />
          {timeCell(p, now)}
        </span>

        <span className="col-span-2 text-[0.9375rem] leading-snug text-pretty text-foreground/90 md:col-span-1 md:col-start-2 md:row-start-1">
          {m.promise}
        </span>

        <span className="flex flex-col gap-2 md:col-start-3 md:row-start-1">
          <span
            className={`font-mono text-[1.5rem] leading-none tabular-nums ${resolved ? 'text-muted-foreground' : ''}`}
          >
            <OddsNumber value={m.shipProbability} />
            <span className="text-base text-muted-foreground">%</span>
            <span className="sr-only"> odds it ships</span>
          </span>
          <OddsBlade value={m.shipProbability} className="w-full max-w-28" />
        </span>

        <span className="text-right font-mono text-base tabular-nums md:col-start-4 md:row-start-1 md:text-left">
          {formatSol(m.collateralSol)}
          <span className="sr-only"> collateral</span>
        </span>
      </Link>
    </li>
  );
}

function RowsSkeleton() {
  return (
    <ul aria-hidden="true" className="flex flex-col">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="border-b border-(--hairline) px-4 py-5">
          <div className="h-11 w-full max-w-xl rounded-full bg-muted/40 motion-safe:animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

export function ProjectsPage() {
  const source = fixtureProjectsSource;
  const query = useQuery(projectsQuery(source));
  const [params, setParams] = useSearchParams();
  const now = useClock('second');
  useLiveDriver();

  const q = params.get('q') ?? '';
  const statuses = parseStatuses(params.get('status'));
  const sort = parseSort(params.get('sort'));

  const update = (patch: { q?: string; status?: MarketStatus[]; sort?: ProjectSort }) => {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string, fallback = '') => {
      if (value && value !== fallback) next.set(key, value);
      else next.delete(key);
    };
    if (patch.q !== undefined) set('q', patch.q);
    if (patch.status !== undefined) set('status', serializeStatuses(patch.status));
    if (patch.sort !== undefined) set('sort', patch.sort, 'ending');
    setParams(next, { replace: true });
  };

  const all = query.data ?? [];
  const shown = selectProjects(all, { q, statuses }, sort);
  const filtered = q.trim() !== '' || statuses.length > 0;

  return (
    <ProjectsFrame title="Projects">
      <header data-rise className="mb-10 flex flex-col gap-3 px-3 md:px-4">
        <h1 className="font-display text-split font-black lowercase">projects</h1>
        <p className="max-w-prose text-lede text-muted-foreground">
          Every team that locked collateral behind a promise. Their record is public, so is what they owe next.
        </p>
        {source.sample ? <p className="text-xs text-muted-foreground">sample data · trading opens at launch</p> : null}
      </header>

      <div data-rise style={{ '--rise': 1 } as CSSProperties} className="mb-8 flex flex-col gap-4 px-3 md:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField value={q} onChange={(v) => update({ q: v })} className="sm:max-w-md sm:flex-1" />
          <label className="flex h-11 items-center gap-2 rounded-full border border-(--hairline) pr-2 pl-4 text-sm text-muted-foreground sm:ml-auto">
            Sort
            <select
              value={sort}
              onChange={(e) => update({ sort: parseSort(e.target.value) })}
              className="h-9 cursor-pointer rounded-full bg-transparent pr-2 pl-1 text-sm font-medium text-foreground"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value} className="bg-background text-foreground">
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <StatusFilter value={statuses} onChange={(v) => update({ status: v })} />
      </div>

      {query.isError ? (
        <p role="alert" className="px-4 text-sm">
          Projects could not be loaded. Reload the page to try again.
        </p>
      ) : query.isPending ? (
        <RowsSkeleton />
      ) : (
        <section aria-label="Project catalog" className="flex flex-col gap-2">
          <p
            role="status"
            data-rise
            style={{ '--rise': 2 } as CSSProperties}
            className="px-3 text-kicker font-semibold uppercase text-muted-foreground md:px-4"
          >
            {shown.length} {shown.length === 1 ? 'project' : 'projects'}
            {filtered ? ` of ${all.length}` : ''}
          </p>
          {shown.length === 0 ? (
            <div className="flex flex-col items-start gap-4 px-3 py-10 md:px-4">
              <p className="text-base">No project matches these filters.</p>
              <button
                type="button"
                onClick={() => setParams(new URLSearchParams(), { replace: true })}
                className="inline-flex h-10 items-center rounded-full border border-(--hairline) px-5 text-sm font-medium transition-colors duration-(--dur-instant) ease-(--ease-standard) [@media(hover:hover)]:hover:bg-(--nav-hover)"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div
                aria-hidden="true"
                className={`hidden gap-x-6 border-b border-(--hairline) px-4 pb-2 text-xs md:pr-11 text-muted-foreground md:grid ${cols}`}
              >
                <span>Project</span>
                <span>Active promise</span>
                <span>Ship odds</span>
                <span>Collateral</span>
                <span className="text-right">Status</span>
              </div>
              <ol className="flex flex-col">
                {shown.map((p, i) => (
                  <Row key={p.slug} p={p} index={i} now={now} />
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </ProjectsFrame>
  );
}
