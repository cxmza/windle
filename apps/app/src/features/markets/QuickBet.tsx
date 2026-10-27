import type { ApiMarket, MarketSide } from '@windle/shared';
import { Popover } from 'radix-ui';
import { type FormEvent, Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Coin } from '@/components/Coin';
import { formatShares } from '../predict/format';
import { sideLabel } from '../predict/market/market-view';
import { BUY_CHIPS, floorTo } from '../predict/market/trade-copy';
import { useBuyOrder } from '../predict/market/use-buy-order';
import { CREATOR_BLOCK_TEXT, tradeBlock } from '../predict/trading';
import { Amount } from '../predict/ui/Amount';
import { PracticeBadge } from '../predict/ui/PracticeBadge';

const trigger =
  'relative inline-flex min-h-8 min-w-11 items-center justify-center rounded-md border px-2.5 text-xs font-semibold transition-colors duration-(--dur-instant) ease-(--ease-standard) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:brightness-90 max-md:min-h-10 max-md:min-w-12';

const SIDE_STYLE: Record<MarketSide, string> = {
  yes: 'border-(--yes) bg-yes-soft text-(--yes) [@media(hover:hover)]:hover:bg-(--yes) [@media(hover:hover)]:hover:text-yes-foreground',
  no: 'border-(--no) bg-no-soft text-(--no) [@media(hover:hover)]:hover:bg-(--no) [@media(hover:hover)]:hover:text-no-foreground',
};

const chip =
  'inline-flex min-h-9 flex-1 items-center justify-center rounded-md border border-(--control-border) px-2 font-mono text-xs font-medium text-foreground tabular-nums transition-colors duration-(--dur-instant) ease-(--ease-standard) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-border-strong aria-pressed:bg-(--selected) active:enabled:bg-(--selected) disabled:cursor-not-allowed disabled:opacity-40 [@media(hover:hover)]:enabled:hover:bg-(--hover) max-md:min-h-11';

function QuoteRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

function QuickBetForm({ market, side, titleId }: { market: ApiMarket; side: MarketSide; titleId: string }) {
  const ids = useId();
  const order = useBuyOrder(market, side);
  const [confirmation, setConfirmation] = useState<ReactNode>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmation) doneRef.current?.focus();
  }, [confirmation]);
  const label = sideLabel(market, side);
  const none = '—';

  const chips = [
    ...BUY_CHIPS.map((v) => ({ key: String(v), text: String(v), value: v })),
    { key: 'max', text: 'Max', value: floorTo(order.balance, 2) },
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    order.submit((trade) =>
      setConfirmation(
        <>
          Bought {formatShares(trade.shares)} {label} shares for <Amount value={trade.costPts} />.
        </>,
      ),
    );
  }

  function setAmount(next: string) {
    setConfirmation(null);
    order.setAmount(next);
  }

  const reason = order.problemMessage ?? (order.typed ? null : 'Pick an amount to see the payout.');

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-foreground">
            Buy <span className={side === 'yes' ? 'text-(--yes)' : 'text-(--no)'}>{label}</span>
          </h2>
          <p className="line-clamp-2 text-xs text-pretty text-muted-foreground">{market.statement}</p>
        </div>
        <PracticeBadge />
      </div>

      <p className="text-xs text-muted-foreground">
        Balance <Amount value={order.balance} roll coin="settle" className="font-semibold text-foreground" />
      </p>

      <div className="flex gap-2">
        {chips.map((c) => {
          const why = order.balanceLoading
            ? 'Loading your balance'
            : c.value <= 0 || c.value > order.balance
              ? 'Not enough points'
              : null;
          const whyId = `${ids}-chip-${c.key}`;
          return (
            <Fragment key={c.key}>
              <button
                type="button"
                className={chip}
                disabled={why !== null}
                aria-pressed={order.raw === String(c.value)}
                aria-describedby={why ? whyId : undefined}
                title={why ?? undefined}
                onClick={() => setAmount(String(c.value))}
              >
                {c.text}
              </button>
              {why ? (
                <span id={whyId} className="sr-only">
                  {why}
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-amount`} className="text-xs font-medium text-muted-foreground">
          Amount (practice points)
        </label>
        <div className="flex min-h-10 items-center gap-2 rounded-md border border-(--control-border) bg-background px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring has-aria-invalid:border-(--no)">
          <input
            id={`${ids}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={order.raw}
            aria-invalid={order.invalid ? true : undefined}
            aria-describedby={`${ids}-reason`}
            onChange={(e) => setAmount(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-base font-semibold tabular-nums outline-none placeholder:text-muted-foreground"
          />
          <Coin decorative className="text-base" />
        </div>
      </div>

      <dl data-quote className="border-y border-(--hairline) py-1.5">
        <QuoteRow label="Shares">{order.quote ? formatShares(order.quote.shares) : none}</QuoteRow>
        <QuoteRow label="Avg price">
          {order.quote ? <Amount value={order.quote.avgPrice} format="price" per="/share" /> : none}
        </QuoteRow>
        <QuoteRow label="Potential payout">{order.quote ? <Amount value={order.quote.maxPayout} /> : none}</QuoteRow>
      </dl>

      <button
        type="submit"
        disabled={order.blocked || order.pending}
        data-side={side}
        aria-describedby={`${ids}-reason`}
        className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-[background-color,filter] duration-(--dur-instant) ease-(--ease-standard) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:enabled:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11 ${
          side === 'yes'
            ? 'bg-(--yes) text-yes-foreground enabled:hover:bg-(--yes-hover)'
            : 'bg-(--no) text-no-foreground enabled:hover:bg-(--no-hover)'
        }`}
      >
        {order.pending ? (
          'Placing order…'
        ) : (
          <>
            Buy {label}
            {order.typed && !order.blocked ? (
              <>
                {' · '}
                <Amount value={order.amount} />
              </>
            ) : null}
          </>
        )}
      </button>

      <div id={`${ids}-reason`} aria-live="polite" className="min-h-8 text-xs text-pretty">
        {order.error ? (
          <p role="alert" className="text-(--no)">
            {order.error}
          </p>
        ) : confirmation ? (
          <p
            data-quick-bet-confirmation
            className="flex flex-wrap items-baseline justify-between gap-2 font-medium text-(--yes)"
          >
            <span>{confirmation}</span>
            <Popover.Close
              ref={doneRef}
              className="rounded-md px-2 py-1 text-xs font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring [@media(hover:hover)]:hover:bg-(--hover)"
            >
              Done
            </Popover.Close>
          </p>
        ) : (
          <p className={order.problemMessage ? 'text-foreground' : 'text-muted-foreground'}>{reason}</p>
        )}
      </div>
    </form>
  );
}

function QuickBetSide({ market, side }: { market: ApiMarket; side: MarketSide }) {
  const titleId = useId();
  return (
    <Popover.Root>
      <Popover.Trigger
        data-quick-bet={side}
        aria-label={`${side === 'yes' ? 'Yes' : 'No'}: buy ${sideLabel(market, side)} on ${market.statement}`}
        className={`${trigger} ${SIDE_STYLE[side]}`}
      >
        {side === 'yes' ? 'Yes' : 'No'}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-quick-bet-panel
          data-popover
          aria-labelledby={titleId}
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-(--z-sheet) w-80 origin-(--radix-popover-content-transform-origin) max-w-[calc(100vw-1.5rem)] rounded-lg border border-(--hairline) bg-surface-raised p-3 text-foreground"
        >
          <QuickBetForm market={market} side={side} titleId={titleId} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One-click bet buttons for a markets-list row. Only markets the exchange can trade right now get them. */
export function QuickBet({ market, now }: { market: ApiMarket; now: number }) {
  const block = tradeBlock(market, now);
  if (block === 'closed') return null;
  if (block === 'creator') {
    return (
      <span
        data-quick-bet-group
        data-quick-bet-blocked
        title={CREATOR_BLOCK_TEXT}
        className="flex items-center justify-end gap-1.5"
      >
        {(['yes', 'no'] as const).map((side) => (
          <button
            key={side}
            type="button"
            disabled
            aria-label={`${side === 'yes' ? 'Yes' : 'No'}: ${CREATOR_BLOCK_TEXT}, so you cannot trade on it`}
            className={`${trigger} cursor-not-allowed border-(--control-border) text-muted-foreground opacity-50`}
          >
            {side === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </span>
    );
  }
  return (
    <span data-quick-bet-group className="flex items-center justify-end gap-1.5">
      <QuickBetSide market={market} side="yes" />
      <QuickBetSide market={market} side="no" />
    </span>
  );
}
