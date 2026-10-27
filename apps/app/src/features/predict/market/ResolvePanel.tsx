import type { ApiMarket, ProposedOutcome } from '@windle/shared';
import { AlertDialog } from 'radix-ui';
import { useId, useState } from 'react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useClock } from '@/lib/clock';
import { errorMessage } from '../errors';
import { formatPts } from '../format';
import { usePredictActions } from '../hooks';
import { Amount } from '../ui/Amount';
import { outcomeLabel } from './market-view';

const OUTCOMES = ['yes', 'no', 'void'] as const satisfies readonly ProposedOutcome[];

const NOTE_MAX = 500;

const TONE: Record<ProposedOutcome, string> = {
  yes: 'border-(--yes) text-(--yes) [@media(hover:hover)]:enabled:hover:bg-yes-soft',
  no: 'border-(--no) text-(--no) [@media(hover:hover)]:enabled:hover:bg-no-soft',
  void: 'border-(--control-border) text-foreground [@media(hover:hover)]:enabled:hover:bg-(--hover)',
};

const outcomeButton =
  'inline-flex min-h-10 flex-1 items-center justify-center rounded-md border px-3 text-sm font-semibold transition-colors duration-(--dur-instant) ease-(--ease-standard) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:enabled:bg-(--selected) disabled:cursor-not-allowed disabled:opacity-50';

function consequence(market: ApiMarket, outcome: ProposedOutcome): string {
  if (outcome === 'void') return 'Every position is refunded at its cost.';
  const winners = outcomeLabel(market, outcome);
  return `Every ${winners} share pays 1 point and every other share pays nothing.`;
}

/**
 * The creator's (or an admin's) controls. The server settles in the same request, so the confirm step says what is
 * about to happen: payouts are automatic and cannot be taken back.
 */
export function ResolvePanel({ market }: { market: ApiMarket }) {
  const ids = useId();
  const toast = useToast();
  const now = useClock('second', market.status === 'open');
  const { resolve } = usePredictActions();
  const [choice, setChoice] = useState<ProposedOutcome | null>(null);
  const [note, setNote] = useState('');

  const creator = market.viewer?.isCreator === true;
  const noLocked = creator && now < Date.parse(market.deadline);
  const lockedReason = '“No” can be decided only after the deadline. Until then the promise can still be kept.';

  function confirm(outcome: ProposedOutcome) {
    const trimmed = note.trim();
    resolve.mutate(
      { slug: market.slug, outcome, ...(trimmed ? { note: trimmed } : {}) },
      {
        onSuccess: (res) => {
          setChoice(null);
          setNote('');
          toast(
            res.alreadyResolved
              ? 'Already resolved with this outcome. Nothing changed.'
              : `Resolved: ${outcomeLabel(market, outcome)}. Paid out ${formatPts(res.settlement.payoutPts)} points to ${res.settlement.positions} ${res.settlement.positions === 1 ? 'position' : 'positions'}.`,
          );
        },
      },
    );
  }

  return (
    <div data-resolve-panel className="flex flex-col gap-3 border-t border-(--hairline) pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{creator ? 'Resolve your market' : 'Resolve as admin'}</h3>
        <p className="max-w-prose text-xs text-pretty text-muted-foreground">
          {creator
            ? 'You decide how this promise ended. Payouts are automatic and final the moment you confirm.'
            : 'You can decide any outcome at any time. Payouts are automatic and final the moment you confirm.'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-note`} className="text-xs font-medium text-muted-foreground">
          Note (optional, shown on the market)
        </label>
        <textarea
          id={`${ids}-note`}
          value={note}
          maxLength={NOTE_MAX}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Link to the proof, or why it was voided"
          className="resize-y rounded-md border border-(--control-border) bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">Choose the outcome</legend>
        {OUTCOMES.map((outcome) => {
          const locked = outcome === 'no' && noLocked;
          return (
            <button
              key={outcome}
              type="button"
              data-outcome={outcome}
              disabled={locked}
              aria-describedby={locked ? `${ids}-locked` : undefined}
              title={locked ? lockedReason : undefined}
              onClick={() => {
                resolve.reset();
                setChoice(outcome);
              }}
              className={`${outcomeButton} ${TONE[outcome]}`}
            >
              {outcomeLabel(market, outcome)}
            </button>
          );
        })}
      </fieldset>
      {noLocked ? (
        <p id={`${ids}-locked`} className="text-xs text-muted-foreground">
          {lockedReason}
        </p>
      ) : null}

      <AlertDialog.Root open={choice !== null} onOpenChange={(open) => (open ? null : setChoice(null))}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay data-scrim className="fixed inset-0 z-(--z-pencil) bg-scrim" />
          <AlertDialog.Content
            data-popover
            className="fixed top-1/2 left-1/2 z-(--z-pencil) flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-(--hairline) bg-surface-raised p-5 text-foreground"
          >
            {choice ? (
              <>
                <div className="flex flex-col gap-2">
                  <AlertDialog.Title className="text-base font-semibold text-balance">
                    Resolve as {outcomeLabel(market, choice)}?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="text-sm text-pretty text-muted-foreground">
                    {consequence(market, choice)} Payouts are automatic and final: this cannot be undone.
                    {market.status === 'open' && now < Date.parse(market.deadline) ? ' Trading stops right away.' : ''}
                  </AlertDialog.Description>
                </div>
                <p className="text-xs text-muted-foreground">
                  {market.traders} {market.traders === 1 ? 'trader' : 'traders'} ·{' '}
                  <Amount value={market.volumePts} format="compact" /> traded
                </p>
                {resolve.error ? (
                  <p role="alert" className="text-sm text-(--no)">
                    {errorMessage(resolve.error, 'The market could not be resolved. Try again.')}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <AlertDialog.Cancel asChild>
                    <Button variant="secondary" disabled={resolve.isPending}>
                      Cancel
                    </Button>
                  </AlertDialog.Cancel>
                  <Button disabled={resolve.isPending} onClick={() => confirm(choice)}>
                    {resolve.isPending ? 'Resolving…' : `Resolve as ${outcomeLabel(market, choice)}`}
                  </Button>
                </div>
              </>
            ) : null}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
