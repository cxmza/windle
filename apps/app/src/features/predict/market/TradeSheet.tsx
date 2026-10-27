import type { ApiMarket } from '@windle/shared';
import { AnimatePresence, LazyMotion, m, type PanInfo, useDragControls } from 'motion/react';
import { Dialog } from 'radix-ui';
import { type PointerEvent, useState } from 'react';
import { usePref } from '@/features/settings/prefs';
import { useClock } from '@/lib/clock';
import { useReducedMotion } from '@/lib/media';
import { calmSpring, cssDuration, loadMaxFeatures } from '@/lib/motion';
import { oddsText, oddsUnit } from '@/lib/odds';
import { CREATOR_BLOCK_TEXT, tradeBlock } from '../trading';
import { sideLabel, toSidePrice } from './market-view';
import { TradePanel } from './TradePanel';
import { closedReason } from './trade-copy';

const barButton =
  'flex min-h-12 flex-1 flex-col items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold transition-[background-color,filter] duration-(--dur-instant) ease-(--ease-standard) active:brightness-90';

export function TradeSheet({ market }: { market: ApiMarket }) {
  const [open, setOpen] = useState(false);
  const odds = usePref('odds');
  const now = useClock('second', market.status === 'open');
  const block = tradeBlock(market, now);
  const reduced = useReducedMotion();
  const drag = useDragControls();

  const fade = { duration: cssDuration('--dur-fast', 180) / 1000 };
  const sheet = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: fade }, exit: { opacity: 0, transition: fade } }
    : {
        initial: { y: '100%' },
        animate: { y: 0, transition: calmSpring('--dur-base', 260) },
        exit: { y: '100%', transition: calmSpring('--dur-fast', 180) },
      };

  function startDrag(event: PointerEvent) {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    drag.start(event);
  }

  function dragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 96 || info.velocity.y > 500) setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div
        data-trade-bar
        className="fixed inset-x-0 bottom-0 z-(--z-dock) border-t border-(--hairline) bg-surface px-(--gutter) pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      >
        {block === null ? (
          <div className="mx-auto flex max-w-xl gap-2">
            {(['yes', 'no'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setOpen(true)}
                className={`${barButton} ${
                  s === 'yes'
                    ? 'bg-(--yes) text-yes-foreground hover:bg-(--yes-hover)'
                    : 'bg-(--no) text-no-foreground hover:bg-(--no-hover)'
                }`}
              >
                <span>{sideLabel(market, s)}</span>
                <span className="font-mono text-xs font-medium tabular-nums">
                  {oddsText(Math.round(toSidePrice(market.probYes, s) * 100), odds)}
                  {oddsUnit(odds)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {block === 'creator'
              ? `${CREATOR_BLOCK_TEXT}, so you cannot trade on it.`
              : (closedReason(market) ?? 'Trading closed at the deadline.')}
          </p>
        )}
      </div>

      <LazyMotion features={loadMaxFeatures} strict>
        <AnimatePresence>
          {open ? (
            <Dialog.Portal forceMount>
              <Dialog.Overlay data-scrim forceMount className="fixed inset-0 z-(--z-pencil) bg-scrim" />
              <Dialog.Content forceMount asChild aria-describedby={undefined}>
                <m.div
                  data-trade-sheet
                  {...sheet}
                  drag="y"
                  dragControls={drag}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 1 }}
                  dragMomentum={false}
                  dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
                  onDragEnd={dragEnd}
                  className="fixed inset-x-0 bottom-0 z-(--z-pencil) flex max-h-[92dvh] flex-col overflow-y-auto rounded-t-2xl border-t border-(--hairline) bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] text-foreground outline-none"
                >
                  <div onPointerDown={startDrag} className="-mx-5 touch-none px-5 pt-2">
                    <span
                      aria-hidden="true"
                      className="mx-auto mb-3 block h-1 w-10 rounded-full bg-(--control-border)"
                    />
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <Dialog.Title className="min-w-0 text-base font-semibold text-balance">
                        {market.statement}
                      </Dialog.Title>
                      <Dialog.Close
                        aria-label="Close trade sheet"
                        className="-mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-instant) hover:bg-(--hover) hover:text-foreground active:bg-(--selected)"
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
                      </Dialog.Close>
                    </div>
                  </div>
                  <TradePanel market={market} bare />
                </m.div>
              </Dialog.Content>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </LazyMotion>
    </Dialog.Root>
  );
}
