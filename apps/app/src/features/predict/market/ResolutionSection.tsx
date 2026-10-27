import type { ApiMarket } from '@windle/shared';
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { usePref } from '@/features/settings/prefs';
import { formatDateTime } from '@/lib/format';
import { formatSolUnit } from '../format';
import { card, sectionTitle } from '../ui/styles';
import { LiveDeadline } from './LiveDeadline';
import { sideLabel } from './market-view';
import { ResolvePanel } from './ResolvePanel';

type StepState = 'done' | 'current' | 'upcoming';

/**
 * Marks the timeline for its reveal: "go" when it is on screen at mount or scrolls into view, "wait" until then.
 * Only CSS under allowed motion reads "wait", so without motion (or without IntersectionObserver) nothing is hidden.
 */
function useRevealOnView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    if (el.getBoundingClientRect().top < window.innerHeight) {
      el.dataset.reveal = 'go';
      return;
    }
    el.dataset.reveal = 'wait';
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.dataset.reveal = 'go';
        io.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Step({
  title,
  state,
  index,
  last = false,
  children,
}: {
  title: string;
  state: StepState;
  index: number;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li
      data-step
      data-step-state={state}
      aria-current={state === 'current' ? 'step' : undefined}
      style={{ '--i': index } as CSSProperties}
      className="relative flex gap-4 pb-6 last:pb-0"
    >
      {last ? null : (
        <span
          aria-hidden="true"
          data-step-line={state === 'done' ? 'drawn' : undefined}
          className={`absolute top-5 bottom-0 left-[0.4375rem] w-px ${state === 'done' ? 'bg-muted-foreground' : 'bg-(--hairline)'}`}
        />
      )}
      <span
        aria-hidden="true"
        className={`relative z-[1] mt-1 size-4 shrink-0 rounded-full border-2 ${
          state === 'done'
            ? 'border-foreground bg-foreground'
            : state === 'current'
              ? 'border-accent-text bg-surface'
              : 'border-(--control-border) bg-surface'
        }`}
      />
      <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${state === 'upcoming' ? 'text-muted-foreground' : ''}`}>
        <h3 className="text-sm font-semibold">
          {title}
          {state === 'upcoming' ? <span className="sr-only"> (upcoming)</span> : null}
        </h3>
        {children}
      </div>
    </li>
  );
}

const quiet = 'text-sm text-muted-foreground text-pretty';

const METHOD_TEXT = {
  creator: "the market's creator",
  admin: 'an admin',
  resolver: 'a resolver',
  chain: 'chain state',
} as const;

function CommunityTimeline({ market }: { market: ApiMarket }) {
  const clock = usePref('clock');
  const r = market.resolution;
  const status = market.status;
  const final = status === 'resolved' || status === 'voided';
  const early = final && r?.resolvedAt !== undefined && Date.parse(r.resolvedAt) < Date.parse(market.deadline);
  const deadlineReached = status !== 'open' && !early;
  const state = (done: boolean, current: boolean): StepState => (done ? 'done' : current ? 'current' : 'upcoming');
  const ref = useRevealOnView<HTMLOListElement>();
  const note = r?.evidence.find((e) => e.kind === 'note')?.text;

  return (
    <ol ref={ref} aria-label="Resolution timeline" className="flex flex-col">
      <Step title="Open" index={0} state="done">
        <p className={quiet}>
          Created <time dateTime={market.createdAt}>{formatDateTime(market.createdAt, clock)}</time> from the tweet
          above.
        </p>
      </Step>

      <Step title="Deadline" index={1} state={state(deadlineReached || early, !final)}>
        <p className={quiet}>
          <LiveDeadline
            deadline={market.deadline}
            live={status === 'open'}
            verb={early ? 'Original deadline' : deadlineReached ? 'Trading closed' : 'Trading closes'}
          />
        </p>
      </Step>

      <Step title={status === 'voided' ? 'Voided' : 'Resolved'} index={2} state={state(final, deadlineReached)} last>
        {final && r?.resolvedAt ? (
          <>
            <p data-resolution-outcome className="text-sm text-foreground">
              {status === 'voided' ? (
                'Voided: every position was refunded at cost.'
              ) : r.finalOutcome && r.finalOutcome !== 'void' ? (
                <>
                  Final outcome <strong className="font-semibold">{sideLabel(market, r.finalOutcome)}</strong>. Winning
                  shares were paid 1 pt each, automatically.
                </>
              ) : (
                'Resolved.'
              )}
              <span className="text-muted-foreground">
                {' '}
                · by {METHOD_TEXT[r.method]} ·{' '}
                <time dateTime={r.resolvedAt}>{formatDateTime(r.resolvedAt, clock)}</time>
              </span>
            </p>
            {note ? <p className="text-sm text-pretty text-muted-foreground">“{note}”</p> : null}
            {/* TODO(motion): reveal the final outcome (count-up of the payout, a settle on the odds figure) */}
          </>
        ) : (
          <p className={quiet}>
            {deadlineReached
              ? 'Waiting for the market creator to decide the outcome.'
              : 'The market creator decides the outcome. Payouts are automatic and final.'}
          </p>
        )}
      </Step>
    </ol>
  );
}

function BackedResolution({ market }: { market: ApiMarket }) {
  const collateral = market.collateral;
  const r = market.resolution;
  const final = r?.finalOutcome;
  return (
    <div className="flex flex-col gap-4">
      {collateral ? (
        <dl className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Collateral locked by the team</dt>
            <dd className="font-mono text-lg tabular-nums">{formatSolUnit(collateral.amountSol)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">On-chain check</dt>
            <dd className="flex items-start gap-1 font-mono text-[0.8125rem] leading-relaxed break-words text-foreground">
              <span className="min-w-0 flex-1">{collateral.check}</span>
              <CopyButton value={collateral.check} label="Copy on-chain check" className="-mt-1.5" />
            </dd>
          </div>
        </dl>
      ) : null}
      <p className="text-sm font-medium text-foreground">Resolves from chain state at the deadline — no resolver.</p>
      <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
        <li>
          <strong className="font-semibold text-foreground">{sideLabel(market, 'yes')}:</strong> the check passes, the
          collateral goes back to the team and {sideLabel(market, 'yes')} shares pay 1 pt each.
        </li>
        <li>
          <strong className="font-semibold text-foreground">{sideLabel(market, 'no')}:</strong> the check fails, the
          collateral is slashed to {sideLabel(market, 'no')} holders and their shares pay 1 pt each.
        </li>
      </ul>
      {final === 'yes' || final === 'no' ? (
        <div className="rounded-xl border border-(--hairline) p-3 text-sm">
          <p className="font-semibold text-foreground">Settled: {sideLabel(market, final)}</p>
          {r?.evidence.map((item) => (
            <p key={item.text} className="mt-1 text-muted-foreground text-pretty">
              {item.text}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ResolutionSection({ market, bare = false }: { market: ApiMarket; bare?: boolean }) {
  return (
    <section aria-labelledby="resolution-title" className={`${bare ? '' : card} flex flex-col gap-5`}>
      <h2 id="resolution-title" className={bare ? 'sr-only' : sectionTitle}>
        Resolution
      </h2>
      {market.tier === 'backed' ? <BackedResolution market={market} /> : <CommunityTimeline market={market} />}
      {market.viewer?.canResolve ? <ResolvePanel market={market} /> : null}
    </section>
  );
}
