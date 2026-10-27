import { useRef } from 'react';
import { Link, NavLink } from 'react-router';
import { useClock } from '@/lib/clock';
import { useReducedMotion } from '@/lib/media';
import { DeadlineValue } from '../features/markets/DeadlineValue';
import { useMarkets } from '../features/predict/hooks';
import { rowClass } from './row-styles';
import { useListFlip } from './use-list-flip';

const SHOWN = 5;

export function EndingSoon({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const query = useMarkets({ status: 'open', sort: 'closing' });
  const now = useClock('second');
  const shown = query.markets.filter((m) => Date.parse(m.deadline) > now).slice(0, SHOWN);
  const list = useRef<HTMLUListElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useListFlip(list, ghosts, shown.map((m) => m.slug).join(' '), reduced);

  return (
    <div data-sidebar-label="mount" className="flex min-h-0 flex-col gap-1">
      <h2 id="ending-soon-label" className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
        Ending soon
      </h2>
      {query.isError ? (
        <p role="alert" className="px-2.5 py-1 text-xs text-muted-foreground">
          Markets could not be loaded.
        </p>
      ) : query.isPending ? (
        <ul aria-hidden="true" className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="mx-2.5 h-4 rounded-md bg-muted/60 motion-safe:animate-pulse" />
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <p role="status" className="px-2.5 py-1 text-xs text-muted-foreground">
          No open markets right now.
        </p>
      ) : (
        <div className="relative">
          <ul ref={list} aria-labelledby="ending-soon-label" className="flex flex-col">
            {shown.map((m) => (
              <li key={m.slug} data-flip-key={m.slug}>
                <NavLink to={`/m/${m.slug}`} onClick={onNavigate} className={`${rowClass} justify-between`}>
                  <span className="truncate" title={m.statement}>
                    {m.project.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-normal tabular-nums">
                    <DeadlineValue deadline={m.deadline} now={now} srLeft />
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div ref={ghosts} aria-hidden="true" className="pointer-events-none absolute inset-0" />
        </div>
      )}
      <Link to="/" onClick={onNavigate} className={`${rowClass} mt-0.5`}>
        All markets
        <span aria-hidden="true" className="ml-auto">
          →
        </span>
      </Link>
    </div>
  );
}
