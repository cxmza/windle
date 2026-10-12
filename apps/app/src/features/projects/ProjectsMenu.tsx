import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Digits } from '@/components/Digits';
import { OddsNumber } from '@/components/OddsNumber';
import { useClock } from '@/lib/clock';
import { countdown, deadlineLabel } from '../markets/format';
import type { MarketStatus } from '../markets/types';
import { SearchField, StatusFilter } from './Filters';
import { LiveDot } from './LiveDot';
import { Monogram } from './Monogram';
import { projectPath, selectProjects, serializeStatuses } from './model';
import { projectsQuery } from './source';

const SHOWN = 5;

type CloseOptions = { restoreFocus: boolean };

type Props = {
  id: string;
  open: boolean;
  onClose: (opts: CloseOptions) => void;
  triggerRef: RefObject<HTMLElement | null>;
};

export function ProjectsMenu({ id, open, onClose, triggerRef }: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<MarketStatus[]>([]);
  const query = useQuery(projectsQuery());
  const now = useClock('second', open);

  useEffect(() => {
    if (!open) return;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    (coarse ? titleRef.current : searchRef.current)?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (t: EventTarget | null) =>
      t instanceof Node && !rootRef.current?.contains(t) && !triggerRef.current?.contains(t);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose({ restoreFocus: true });
    };
    const onAway = (e: Event) => {
      if (outside(e.target)) onClose({ restoreFocus: false });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onAway);
    document.addEventListener('focusin', onAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onAway);
      document.removeEventListener('focusin', onAway);
    };
  }, [open, onClose, triggerRef]);

  const all = query.data ?? [];
  const matched = selectProjects(all, { q, statuses }, 'ending');
  const shown = matched.slice(0, SHOWN);

  const allParams = new URLSearchParams();
  if (q.trim()) allParams.set('q', q.trim());
  if (statuses.length > 0) allParams.set('status', serializeStatuses(statuses));
  const allHref = allParams.size > 0 ? `/projects?${allParams}` : '/projects';

  return (
    <div
      ref={rootRef}
      id={id}
      data-projects-menu
      data-open={open || undefined}
      data-glass
      data-dense
      inert={!open}
      aria-hidden={!open || undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="pointer-events-auto absolute inset-x-(--gutter) top-[calc(var(--nav-offset)+var(--topbar-height)+0.5rem+env(safe-area-inset-top,0px))] z-(--z-sheet) mx-auto flex max-w-[44rem] flex-col gap-4 rounded-[2rem] p-4 max-md:fixed max-md:inset-x-2 max-md:top-[calc(0.5rem+env(safe-area-inset-top,0px))] max-md:bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-md:max-w-none md:p-5"
    >
      <div className="flex items-center justify-between gap-3 pl-2">
        <h2
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="font-display text-lg font-black lowercase tracking-tight outline-none"
        >
          projects
        </h2>
        <button
          type="button"
          onClick={() => onClose({ restoreFocus: true })}
          aria-label="Close projects menu"
          className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) md:hidden [@media(hover:hover)]:hover:bg-(--nav-hover) [@media(hover:hover)]:hover:text-foreground"
        >
          <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <SearchField ref={searchRef} value={q} onChange={setQ} />
      <StatusFilter value={statuses} onChange={setStatuses} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-none">
        {query.isError ? (
          <p role="alert" className="px-3 py-6 text-sm">
            Projects could not be loaded. Close the menu and try again.
          </p>
        ) : query.isPending ? (
          <ul aria-hidden="true" className="flex flex-col gap-1">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="h-16 rounded-3xl bg-muted/40 motion-safe:animate-pulse" />
            ))}
          </ul>
        ) : shown.length === 0 ? (
          <p role="status" className="px-3 py-6 text-sm text-muted-foreground">
            No project matches. Clear the search or a filter.
          </p>
        ) : (
          <ul aria-label="Projects" className="flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain">
            {shown.map((p, i) => {
              const m = p.current;
              return (
                <li key={p.slug} data-menu-row style={{ '--i': i } as CSSProperties}>
                  <Link
                    to={projectPath(p.slug)}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 rounded-3xl px-3 py-2.5 transition-colors duration-(--dur-instant) ease-(--ease-standard) [@media(hover:hover)]:hover:bg-(--nav-hover)"
                  >
                    <Monogram name={p.name} size="md" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[0.9375rem] font-semibold">{p.name}</span>
                        <span className="text-xs font-semibold tracking-[0.12em] text-accent-text">${p.ticker}</span>
                      </span>
                      <span className="truncate text-sm text-muted-foreground">{m.promise}</span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5 text-right">
                      <span className="font-mono text-base tabular-nums">
                        <OddsNumber value={m.shipProbability} />
                        <span className="text-xs text-muted-foreground">%</span>
                        <span className="sr-only"> odds it ships</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular-nums">
                        {m.status === 'live' ? <LiveDot /> : null}
                        {m.status === 'live' ? (
                          <Digits text={countdown(m.deadline, now)} dir="down" />
                        ) : (
                          deadlineLabel(m, now)
                        )}
                        {m.status === 'live' ? <span className="sr-only"> left</span> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-(--hairline) pt-3 pl-2">
        <span className="text-xs text-muted-foreground">
          {query.data ? `Showing ${shown.length} of ${matched.length}` : null}
        </span>
        <Link
          to={allHref}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-glow px-5 text-sm font-semibold text-ink-inverse transition-colors duration-(--dur-instant) ease-(--ease-standard) [@media(hover:hover)]:hover:bg-[color-mix(in_oklab,var(--glow)_88%,var(--foreground))]"
        >
          All projects
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
