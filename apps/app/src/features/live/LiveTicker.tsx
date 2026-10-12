import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from '@/lib/media';
import { LiveDot } from '../projects/LiveDot';
import { projectsQuery } from '../projects/source';
import type { Project } from '../projects/types';
import type { LiveEvent, LiveFeed } from './feed';
import { activityOf } from './feed';
import { useLiveSnapshot } from './use-live';

interface Line {
  id: string;
  ticker: string;
  text: string;
  odds?: { from: number; to: number };
}

const lineOf = (e: LiveEvent): Line => ({
  id: e.id,
  ticker: e.ticker,
  text: activityOf(e).text,
  ...(e.kind === 'trade' ? { odds: { from: e.from, to: e.to } } : {}),
});

function latestTrade(projects: readonly Project[] | undefined): Line | null {
  let best: { p: Project; at: number; text: string; id: string } | null = null;
  for (const p of projects ?? []) {
    for (const a of p.activity) {
      const at = Date.parse(a.at);
      if (a.kind === 'trade' && (!best || at > best.at)) best = { p, at, text: a.text, id: a.id };
    }
  }
  return best ? { id: best.id, ticker: best.p.ticker, text: best.text } : null;
}

function TickerLine({ line, leaving }: { line: Line; leaving?: boolean }) {
  const up = line.odds && line.odds.to >= line.odds.from;
  return (
    <span
      data-ticker-item
      data-leaving={leaving || undefined}
      aria-hidden={leaving || undefined}
      className="absolute inset-0 flex items-center gap-2 truncate whitespace-nowrap"
    >
      <span className="font-semibold tracking-[0.12em] text-accent-text max-sm:tracking-normal">${line.ticker}</span>
      <span className={`truncate text-foreground/90 ${line.odds ? 'max-sm:hidden' : ''}`}>{line.text}</span>
      {line.odds ? (
        <span className={`shrink-0 font-mono text-xs tabular-nums ${up ? 'text-glow' : 'text-(--slash-warm)'}`}>
          {up ? '▲' : '▼'}&#8202;{line.odds.to}%<span className="sr-only"> ship odds</span>
        </span>
      ) : null}
    </span>
  );
}

const iconButton =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) [@media(hover:hover)]:hover:bg-(--nav-hover) [@media(hover:hover)]:hover:text-foreground';

/** One-line glass capsule with the newest sample trade; the previous line leaves upward as the next one arrives. */
export function LiveTicker({ feed }: { feed: LiveFeed | undefined }) {
  const reduced = useReducedMotion();
  const snap = useLiveSnapshot(feed);
  const projects = useQuery(projectsQuery());
  if (!feed) return null;
  const fallback = latestTrade(projects.data);
  const lines = [...snap.events.map(lineOf), ...(fallback ? [fallback] : [])].slice(0, 2);
  const [current, previous] = lines;
  const running = !reduced && !snap.paused;

  return (
    <section
      aria-label="Live trades, sample data"
      data-glass
      data-dense
      className="pointer-events-auto flex h-10 w-[min(25rem,100%)] items-center gap-2.5 pr-1 pl-3.5 text-sm"
    >
      <span className="flex shrink-0 items-center gap-2 text-kicker font-semibold text-muted-foreground uppercase">
        <LiveDot paused={!running} />
        <span className="max-sm:sr-only">{running ? 'Live' : reduced ? 'Latest' : 'Paused'}</span>
      </span>
      <span className="relative h-5 min-w-0 flex-1 overflow-hidden">
        {previous && current && snap.events.length > 0 ? (
          <TickerLine key={previous.id} line={previous} leaving />
        ) : null}
        {current ? (
          <TickerLine key={current.id} line={current} />
        ) : (
          <span className="absolute inset-0 truncate text-muted-foreground">Waiting for the first trade</span>
        )}
      </span>
      {reduced ? null : (
        <button
          type="button"
          onClick={() => feed.setPaused(!snap.paused)}
          aria-label={snap.paused ? 'Resume live trades' : 'Pause live trades'}
          className={iconButton}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            {snap.paused ? <path d="M5 3.5v9l7.5-4.5z" /> : <path d="M4.5 3.5h2.25v9H4.5zM9.25 3.5h2.25v9H9.25z" />}
          </svg>
        </button>
      )}
    </section>
  );
}
