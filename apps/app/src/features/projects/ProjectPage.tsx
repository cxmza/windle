import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { Link, useParams } from 'react-router';
import { OddsNumber } from '@/components/OddsNumber';
import { useClock } from '@/lib/clock';
import { useLiveDriver } from '../live/use-live';
import { Countdown } from '../markets/Countdown';
import { formatDeadline, formatSol } from '../markets/format';
import { OddsBlade } from '../markets/OddsBlade';
import { SideButtons } from '../markets/SideButtons';
import { StatusPill } from '../markets/StatusPill';
import { isOpen } from '../markets/types';
import { ago, formatDate } from './format';
import { LiveDot } from './LiveDot';
import { Monogram } from './Monogram';
import { trackRecord } from './model';
import { ProjectsFrame } from './ProjectsFrame';
import { RecordLabel } from './RecordLabel';
import { fixtureProjectsSource, projectsQuery } from './source';
import type { ActivityKind, PastPromise, Project } from './types';

const back =
  'inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) [@media(hover:hover)]:hover:bg-(--nav-hover) [@media(hover:hover)]:hover:text-foreground';

const LINKS = ['Website', 'X', 'Docs'] as const;

const ODDS_DELAY = 300;

const rise = (i: number): CSSProperties => ({ '--rise': i }) as CSSProperties;

const kindLabel: Record<ActivityKind, string> = {
  trade: 'Trade',
  promise: 'New promise',
  settlement: 'Settlement',
};

function Hero({ p }: { p: Project }) {
  const m = p.current;
  const live = m.status === 'live';
  const open = isOpen(m);
  const tick = useClock('second', live);
  return (
    <section
      aria-labelledby="promise-title"
      data-glass
      data-dense
      data-rise="fade"
      style={rise(2)}
      className="flex flex-col gap-7 rounded-[2rem] p-6 md:gap-8 md:p-9"
    >
      <div data-rise style={rise(3)} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-kicker font-semibold uppercase text-muted-foreground">
          {open ? 'Current promise' : 'Last promise'}
        </p>
        <StatusPill status={m.status} />
        {live ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <LiveDot />
            open for trading at launch
          </span>
        ) : null}
      </div>

      <h2
        id="promise-title"
        data-rise
        style={rise(4)}
        className="max-w-[28ch] font-display text-[clamp(1.5rem,0.9rem+2.4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.02em] text-balance"
      >
        {m.promise}
      </h2>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-12">
        <div
          data-rise
          style={{ ...rise(5), '--enter-delay': `${ODDS_DELAY}ms` } as CSSProperties}
          className="flex flex-col gap-3"
        >
          <div className="flex items-end gap-3">
            <p className="font-display text-[3.5rem] leading-none font-bold tracking-[-0.04em] tabular-nums md:text-[4.5rem]">
              <OddsNumber value={m.shipProbability} enter delayMs={ODDS_DELAY} />
              <span className="text-[0.5em] text-muted-foreground">%</span>
              <span className="sr-only"> odds it ships</span>
            </p>
            <span aria-hidden="true" className="pb-2 text-xs text-muted-foreground">
              odds it ships
            </span>
          </div>
          <OddsBlade value={m.shipProbability} enter />
        </div>

        <dl data-rise style={rise(6)} className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
          <div className="col-span-2 flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Checked onchain at the deadline</dt>
            <dd className="font-mono text-[0.8125rem] leading-relaxed text-foreground/90">{m.check}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Collateral</dt>
            <dd className="font-mono text-lg tabular-nums">{formatSol(m.collateralSol)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{live ? 'Time left' : 'Deadline'}</dt>
            <dd className={`text-lg tabular-nums ${live ? 'font-mono' : ''}`}>
              {live ? (
                <>
                  <Countdown deadline={m.deadline} now={tick} />
                  <span className="sr-only">, until {formatDeadline(m.deadline)}</span>
                </>
              ) : (
                <time dateTime={m.deadline}>{formatDeadline(m.deadline)}</time>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {open ? (
        <div className="max-w-md border-t border-(--hairline) pt-6">
          <SideButtons key={m.id} market={m} sample={fixtureProjectsSource.sample} />
        </div>
      ) : (
        <p className="border-t border-(--hairline) pt-6 text-sm text-muted-foreground">
          Settled: {m.status} against the deadline of {formatDeadline(m.deadline)}.
        </p>
      )}
    </section>
  );
}

function History({ items }: { items: readonly PastPromise[] }) {
  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-5">
      <h2 id="history-title" className="px-1 text-kicker font-semibold uppercase text-muted-foreground">
        Promise history
      </h2>
      {items.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No earlier promises. This is their first.</p>
      ) : (
        <ol className="flex flex-col">
          {items.map((h, i) => {
            const shipped = h.outcome === 'shipped';
            return (
              <li key={h.id} data-timeline-item className="relative flex gap-4 pb-7 last:pb-0">
                {i < items.length - 1 ? (
                  <span aria-hidden="true" className="absolute top-6 bottom-0 left-[0.6875rem] w-px bg-(--hairline)" />
                ) : null}
                <span
                  aria-hidden="true"
                  className={`relative mt-1 size-[1.375rem] shrink-0 rounded-full border-2 ${shipped ? 'border-glow bg-glow' : 'border-(--slash-warm) bg-background'}`}
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-[0.9375rem] leading-snug font-medium text-pretty">{h.statement}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                    <StatusPill status={h.outcome} />
                    <time dateTime={h.settledAt}>{formatDate(h.settledAt)}</time>
                    <span className="font-mono tabular-nums">
                      {formatSol(h.collateralSol)} {shipped ? 'released' : 'slashed'}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Activity({ items, now }: { items: Project['activity']; now: number }) {
  const [initial] = useState(() => new Set(items.map((e) => e.id)));
  return (
    <section aria-labelledby="activity-title" className="flex flex-col gap-5">
      <h2 id="activity-title" className="px-1 text-kicker font-semibold uppercase text-muted-foreground">
        Recent activity
      </h2>
      {items.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="-mt-3.5 flex flex-col">
          {items.map((e) => (
            <li
              key={e.id}
              data-activity-row
              data-fresh={initial.has(e.id) ? undefined : true}
              className="border-b border-(--hairline)"
            >
              <div>
                <div data-activity-body className="flex items-start justify-between gap-4 py-3.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-[0.9375rem] leading-snug text-pretty">{e.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {kindLabel[e.kind]} · <time dateTime={e.at}>{ago(e.at, now)}</time>
                    </p>
                  </div>
                  {e.amountSol === undefined ? null : (
                    <span className="shrink-0 font-mono text-sm tabular-nums">{formatSol(e.amountSol)}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="flex items-center gap-5">
        <div className="size-20 rounded-[30%] bg-muted/40 motion-safe:animate-pulse" />
        <div className="h-10 w-64 rounded-full bg-muted/40 motion-safe:animate-pulse" />
      </div>
      <div className="h-80 rounded-[2rem] bg-muted/30 motion-safe:animate-pulse" />
    </div>
  );
}

export function ProjectPage() {
  useLiveDriver();
  const { slug = '' } = useParams();
  const query = useQuery(projectsQuery(fixtureProjectsSource));
  const now = useClock('second');
  const project = query.data?.find((p) => p.slug === slug) ?? null;

  return (
    <ProjectsFrame title={project?.name ?? 'Project'}>
      <div className="flex flex-col gap-10 md:gap-14">
        <Link to="/projects" data-rise style={rise(0)} className={`${back} -ml-2`}>
          <span aria-hidden="true">←</span>
          All projects
        </Link>

        {query.isError ? (
          <p role="alert" className="text-sm">
            This project could not be loaded. Reload the page to try again.
          </p>
        ) : query.isPending ? (
          <Skeleton />
        ) : !project ? (
          <div className="flex flex-col items-start gap-4">
            <h1 className="font-display text-split font-black lowercase">no such project</h1>
            <p className="max-w-prose text-muted-foreground">
              Nothing is listed under “{slug}”. It may have been renamed.
            </p>
          </div>
        ) : (
          <>
            <header data-rise style={rise(1)} className="flex flex-col gap-5 px-1 md:flex-row md:items-center md:gap-7">
              <Monogram name={project.name} size="lg" />
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h1 className="font-display text-split font-black lowercase">{project.name}</h1>
                  <span className="text-sm font-semibold tracking-[0.12em] text-accent-text">${project.ticker}</span>
                </div>
                <p className="max-w-prose text-muted-foreground">{project.summary}</p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
                  <RecordLabel record={trackRecord(project)} />
                  <ul aria-label="Project links, not set yet" className="flex flex-wrap gap-2">
                    {LINKS.map((l) => (
                      <li key={l}>
                        <button
                          type="button"
                          disabled
                          title="The team has not added this link yet"
                          className="inline-flex h-8 items-center rounded-full border border-(--hairline) px-3.5 text-xs font-medium text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {l}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                {fixtureProjectsSource.sample ? (
                  <p className="text-xs text-muted-foreground">sample data · trading opens at launch</p>
                ) : null}
              </div>
            </header>

            <Hero key={project.slug} p={project} />

            <div data-rise style={rise(7)} className="grid gap-12 md:grid-cols-2 md:gap-16">
              <History items={project.history} />
              <Activity key={project.slug} items={project.activity} now={now} />
            </div>
          </>
        )}
      </div>
    </ProjectsFrame>
  );
}
