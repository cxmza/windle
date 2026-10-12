import { type RefObject, useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';
import { OddsNumber } from '@/components/OddsNumber';
import { useClock } from '@/lib/clock';
import { projectPath, projectSlug } from '../projects/model';
import { Countdown } from './Countdown';
import { formatDeadline, formatSol } from './format';
import { OddsBlade } from './OddsBlade';
import { SideButtons } from './SideButtons';
import { StatusPill } from './StatusPill';
import type { Market } from './types';

type Props = {
  market: Market | null;
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  sample: boolean;
};

export function MarketPanel({ market, open, onClose, panelRef, sample }: Props) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useClock('second', open && market?.status === 'live');
  const marketId = market?.id;

  useEffect(() => {
    if (open && marketId) headingRef.current?.focus({ preventScroll: true });
  }, [open, marketId]);

  const live = market?.status === 'live';

  return (
    <aside
      ref={panelRef}
      data-market-panel
      data-open={open || undefined}
      inert={!open}
      aria-hidden={!open || undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="fixed z-(--z-sheet) flex flex-col overflow-y-auto overscroll-contain rounded-(--panel-radius) border border-(--hairline) bg-(--panel-surface) shadow-[0_30px_80px_-30px_var(--background)] max-md:inset-x-2 max-md:bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-md:max-h-[62dvh] md:top-[calc(var(--topbar-height)+var(--nav-offset)*2)] md:right-(--gutter) md:max-h-[calc(100dvh-var(--topbar-height)-var(--nav-offset)*3-4.5rem)] md:w-[min(26rem,calc(100vw-2*var(--gutter)))]"
    >
      {market ? (
        <div className="flex flex-col gap-5 p-5 md:gap-6 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold tracking-[0.12em] text-accent-text">${market.ticker}</span>
              <span className="text-muted-foreground">{market.team}</span>
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close market"
              className="-mt-2 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) hover:bg-(--nav-hover) hover:text-foreground"
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

          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className="text-lg leading-[1.25] font-semibold md:text-[1.375rem] tracking-[-0.01em] text-balance outline-none"
          >
            {market.promise}
          </h2>

          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <p className="font-display text-[2.5rem] leading-none md:text-[3.25rem] font-bold tracking-[-0.04em] tabular-nums">
                <OddsNumber key={market.id} value={market.shipProbability} />
                <span className="text-[0.55em] text-muted-foreground">%</span>
              </p>
              <div className="flex flex-col items-end gap-1.5 pb-1">
                <StatusPill status={market.status} />
                <span className="text-xs text-muted-foreground">odds it ships</span>
              </div>
            </div>
            <OddsBlade key={market.id} value={market.shipProbability} />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-(--hairline) pt-5 text-sm">
            <div className="col-span-2 flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Checked onchain at the deadline</dt>
              <dd className="font-mono text-[0.8125rem] leading-relaxed text-foreground/90">{market.check}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Collateral</dt>
              <dd className="font-mono text-base tabular-nums">{formatSol(market.collateralSol)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{live ? 'Time left' : 'Deadline'}</dt>
              <dd className={`text-base tabular-nums ${live ? 'font-mono' : ''}`}>
                {live ? (
                  <>
                    <Countdown key={market.id} deadline={market.deadline} now={now} />
                    <span className="sr-only">, until {formatDeadline(market.deadline)}</span>
                  </>
                ) : (
                  <time dateTime={market.deadline}>{formatDeadline(market.deadline)}</time>
                )}
              </dd>
            </div>
          </dl>

          <SideButtons key={market.id} market={market} sample={sample} />

          <Link
            to={projectPath(projectSlug(market))}
            className="inline-flex min-h-11 items-center justify-between gap-2 self-start rounded-full border border-(--hairline) px-5 text-sm font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) [@media(hover:hover)]:hover:bg-(--nav-hover)"
          >
            <span>About {market.team}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
