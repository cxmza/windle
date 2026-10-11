import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import { useNow } from '@/lib/media';
import { countdown, formatDeadline, formatSol, sidePrice } from './format';
import { OddsBlade } from './OddsBlade';
import { StatusPill } from './StatusPill';
import type { Market } from './types';

type Props = {
  market: Market | null;
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  sample: boolean;
};

const sideButton =
  'flex min-h-14 flex-1 items-center justify-between gap-3 rounded-full px-5 text-sm font-semibold transition-[background-color,border-color,color,translate] duration-(--dur-instant) ease-(--ease-standard) active:translate-y-px';

export function MarketPanel({ market, open, onClose, panelRef, sample }: Props) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useNow(1000, open && market?.status === 'live');
  const [noteFor, setNoteFor] = useState<string | null>(null);
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
                {market.shipProbability}
                <span className="text-[0.55em] text-muted-foreground">%</span>
              </p>
              <div className="flex flex-col items-end gap-1.5 pb-1">
                <StatusPill status={market.status} />
                <span className="text-xs text-muted-foreground">odds it ships</span>
              </div>
            </div>
            <OddsBlade value={market.shipProbability} />
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
                    <time dateTime={market.deadline}>{countdown(market.deadline, now)}</time>
                    <span className="sr-only">, until {formatDeadline(market.deadline)}</span>
                  </>
                ) : (
                  <time dateTime={market.deadline}>{formatDeadline(market.deadline)}</time>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNoteFor(market.id)}
                className={`${sideButton} bg-glow text-ink-inverse hover:bg-[color-mix(in_oklab,var(--glow)_88%,var(--foreground))]`}
              >
                <span className="tracking-[0.08em] uppercase">Ship</span>
                <span className="font-mono tabular-nums">{sidePrice(market, 'ship')}</span>
              </button>
              <button
                type="button"
                onClick={() => setNoteFor(market.id)}
                className={`${sideButton} border border-(--slash-warm)/70 bg-background text-foreground hover:border-(--slash-warm) hover:bg-[color-mix(in_oklab,var(--slash-warm)_10%,var(--background))]`}
              >
                <span className="tracking-[0.08em] uppercase">Slash</span>
                <span className="font-mono tabular-nums">{sidePrice(market, 'slash')}</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Price per share in SOL; a share pays 1 SOL if its side wins.
            </p>
            <p role="status" className="min-h-4 text-xs text-accent-text">
              {noteFor === market.id
                ? `Trading is not live yet${sample ? ', this is sample data' : ''}. Nothing was placed.`
                : null}
            </p>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
