import type { ApiMarket, MarketSide } from '@windle/shared';
import { Slider } from 'radix-ui';
import { Fragment, type ReactNode, useId, useState } from 'react';
import { ChangeTint } from '@/components/ChangeTint';
import { Coin } from '@/components/Coin';
import { usePref } from '@/features/settings/prefs';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { useClock } from '@/lib/clock';
import { oddsText, oddsUnit } from '@/lib/odds';
import { errorMessage } from '../errors';
import { formatPts, formatShares } from '../format';
import { useBalance, usePosition, usePredictActions, useQuote, useSellQuote } from '../hooks';
import { CREATOR_BLOCK_TEXT, type TradeBlock, tradeBlock } from '../trading';
import { Amount } from '../ui/Amount';
import { PracticeBadge } from '../ui/PracticeBadge';
import { card } from '../ui/styles';
import { outcomeLabel, sideLabel, toSidePrice } from './market-view';
import { PayoutNote } from './PayoutNote';
import { BUY_CHIPS, closedReason, floorTo, parseAmount, problemText, sanitizeAmount, type Tab } from './trade-copy';

const TABS = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const satisfies readonly { value: Tab; label: string }[];

const SELL_CHIPS = [0.25, 0.5] as const;

const SIDES = ['yes', 'no'] as const satisfies readonly MarketSide[];

const chip =
  'inline-flex min-h-9 min-w-0 items-center justify-center rounded-md border border-(--control-border) px-2 font-mono text-xs font-medium text-foreground tabular-nums transition-colors duration-(--dur-instant) ease-(--ease-standard) active:enabled:bg-(--selected) disabled:cursor-not-allowed disabled:opacity-40 [@media(hover:hover)]:enabled:hover:bg-(--hover) max-md:min-h-10';

const sideButton: Record<MarketSide, string> = {
  yes: 'bg-(--yes) text-yes-foreground enabled:hover:bg-(--yes-hover)',
  no: 'bg-(--no) text-no-foreground enabled:hover:bg-(--no-hover)',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

type Props = { market: ApiMarket; bare?: boolean };

const CLOSED_TITLE: Record<ApiMarket['status'], string> = {
  open: 'Trading closed',
  closed: 'Trading closed',
  proposed: 'Outcome proposed',
  disputed: 'Under dispute',
  resolved: 'Resolved',
  voided: 'Voided',
};

function BalanceReadout({ balance }: { balance: number | null }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <PracticeBadge />
      <p className="text-xs text-muted-foreground">
        Balance{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {balance === null ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">loading</span>
            </>
          ) : (
            <ChangeTint value={balance} text={formatPts(balance)}>
              <Amount value={balance} roll coin="pulse" />
            </ChangeTint>
          )}
        </span>
      </p>
    </div>
  );
}

function ClosedPanel({ market, bare, block }: { market: ApiMarket; bare: boolean; block: TradeBlock }) {
  const balance = useBalance();
  const final = market.status === 'resolved' ? market.resolution?.finalOutcome : undefined;
  const own = block === 'creator';
  return (
    <section
      aria-label="Trade"
      data-trade-panel
      data-closed
      data-creator-block={own || undefined}
      className={`${bare ? '' : `${card} h-full`} flex flex-col gap-4`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {own ? CREATOR_BLOCK_TEXT : CLOSED_TITLE[market.status]}
        </h2>
        <BalanceReadout balance={balance} />
      </div>
      {own ? (
        <p className="text-sm text-pretty text-foreground">
          The creator cannot trade on their own market, so the odds stay honest.
          {market.viewer?.canResolve ? ' You decide the outcome in the Resolution tab below.' : ''}
        </p>
      ) : (
        <>
          {final ? (
            <p className="text-sm text-muted-foreground">
              Final outcome{' '}
              <span
                className={`font-semibold ${final === 'void' ? 'text-foreground' : final === 'yes' ? 'text-(--yes)' : 'text-(--no)'}`}
              >
                {outcomeLabel(market, final)}
              </span>
            </p>
          ) : null}
          <p className="text-sm text-pretty text-foreground">
            {closedReason(market) ?? 'Trading closed at the deadline.'}
          </p>
          <PayoutNote market={market} />
        </>
      )}
      <p className="mt-auto text-xs text-muted-foreground">Practice points — no real value.</p>
    </section>
  );
}

export function TradePanel({ market, bare = false }: Props) {
  const now = useClock('second', market.status === 'open');
  const block = tradeBlock(market, now);
  return block === null ? (
    <OpenPanel market={market} bare={bare} />
  ) : (
    <ClosedPanel market={market} bare={bare} block={block} />
  );
}

function OpenPanel({ market, bare }: { market: ApiMarket; bare: boolean }) {
  const ids = useId();
  const odds = usePref('odds');
  const [tab, setTab] = useState<Tab>('buy');
  const [raw, setRaw] = useState('');
  const [confirmation, setConfirmation] = useState<ReactNode>(null);
  const balanceOrNull = useBalance();
  const actions = usePredictActions();

  const balance = balanceOrNull ?? 0;
  const position = usePosition(market.slug);
  const owned: Record<MarketSide, number> = { yes: position?.yesShares ?? 0, no: position?.noShares ?? 0 };
  const held: MarketSide = owned.yes >= owned.no ? 'yes' : 'no';
  const amount = parseAmount(raw);
  const typed = raw.trim() !== '';

  const buyYes = useQuote(market, 'yes', tab === 'buy' ? amount : 0);
  const buyNo = useQuote(market, 'no', tab === 'buy' ? amount : 0);
  const sellYes = useSellQuote(market, 'yes', tab === 'sell' ? amount : 0);
  const sellNo = useSellQuote(market, 'no', tab === 'sell' ? amount : 0);
  const quotes = { yes: tab === 'buy' ? buyYes : sellYes, no: tab === 'buy' ? buyNo : sellNo };
  const mutation = tab === 'buy' ? actions.buy : actions.sell;
  const placing = mutation.isPending ? mutation.variables?.side : undefined;

  const problem = (side: MarketSide) => (typed ? quotes[side].problem : null);
  const messages = [
    ...new Set(
      SIDES.flatMap((side) => {
        const p = problem(side);
        return p ? [problemText(p, { tab, market, side, balancePts: balance, owned: owned[side] })] : [];
      }),
    ),
  ];
  const blocked = (side: MarketSide) => !typed || amount <= 0 || quotes[side].problem !== null;
  const sellHint = tab === 'sell' && owned.yes <= 0 && owned.no <= 0 && !typed ? 'You hold no shares to sell.' : null;
  const reason =
    messages.length > 0 ? messages.join(' ') : (sellHint ?? (typed ? null : 'Enter an amount to see a quote.'));

  const base = tab === 'buy' ? balance : owned[held];
  const pct = base > 0 ? Math.min(100, Math.max(0, Math.round((amount / base) * 100))) : 0;

  function reset() {
    setConfirmation(null);
    actions.buy.reset();
    actions.sell.reset();
  }

  function setAmount(next: string) {
    reset();
    setRaw(next);
  }

  function fromPct(value: number) {
    if (value <= 0) return setAmount('');
    const digits = tab === 'buy' ? 2 : value >= 100 ? 8 : 4;
    setAmount(String(floorTo((base * value) / 100, digits)));
  }

  function place(side: MarketSide) {
    if (blocked(side) || mutation.isPending) return;
    const label = sideLabel(market, side);
    if (tab === 'buy') {
      actions.buy.mutate(
        { market, side, amountPts: amount },
        {
          onSuccess: ({ trade }) => {
            setConfirmation(
              <>
                Bought {formatShares(trade.shares)} {label} shares for <Amount value={trade.costPts} />.
              </>,
            );
            setRaw('');
          },
        },
      );
    } else {
      actions.sell.mutate(
        { market, side, shares: amount, owned: owned[side] },
        {
          onSuccess: ({ trade }) => {
            setConfirmation(
              <>
                Sold {formatShares(trade.shares)} {label} shares for <Amount value={trade.costPts} />.
              </>,
            );
            setRaw('');
          },
        },
      );
    }
  }

  const chips =
    tab === 'buy'
      ? [
          ...BUY_CHIPS.map((v) => ({ key: String(v), text: String(v), value: v })),
          { key: 'max', text: 'Max', value: floorTo(balance, 2) },
        ]
      : [
          ...SELL_CHIPS.map((f) => ({ key: String(f), text: `${f * 100}%`, value: floorTo(owned[held] * f, 4) })),
          { key: 'max', text: 'Max', value: floorTo(owned[held], 8) },
        ];

  const none = '—';
  const quoteRows = (side: MarketSide): { label: string; value: ReactNode }[] => {
    if (tab === 'buy') {
      const q = typed ? quotes[side].quote : null;
      const buy = q && 'maxPayout' in q ? q : null;
      return [
        { label: 'Shares', value: buy ? formatShares(buy.shares) : none },
        { label: 'Avg price', value: buy ? <Amount value={buy.avgPrice} format="price" /> : none },
        { label: 'Payout', value: buy ? <Amount value={buy.maxPayout} /> : none },
      ];
    }
    const q = typed ? quotes[side].quote : null;
    const sell = q && 'proceedsPts' in q ? q : null;
    return [
      { label: 'Shares', value: sell ? formatShares(amount) : none },
      { label: 'Avg price', value: sell ? <Amount value={sell.avgPrice} format="price" /> : none },
      { label: 'Proceeds', value: sell ? <Amount value={sell.proceedsPts} /> : none },
    ];
  };

  const error = mutation.error;
  const errorText = error ? errorMessage(error, 'The trade could not be placed. Try again.') : null;
  const invalid = messages.length > 0;

  return (
    <section aria-label="Trade" data-trade-panel className={`${bare ? '' : `${card} h-full`} flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-3">
        <SegmentedControl
          label="Order type"
          value={tab}
          onValueChange={(next) => {
            reset();
            setRaw('');
            setTab(next);
          }}
          options={TABS}
        />
        <BalanceReadout balance={balanceOrNull} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-amount`} className="truncate text-xs font-medium text-muted-foreground">
          {tab === 'buy' ? 'Amount' : `Shares of ${sideLabel(market, held)}`}
          {tab === 'sell' && owned[held] > 0 ? ` (you hold ${formatShares(owned[held])})` : ''}
        </label>
        <div className="flex min-h-11 items-center gap-2 rounded-md border border-(--control-border) bg-background px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring has-aria-invalid:border-(--no)">
          <input
            id={`${ids}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={raw}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={`${ids}-reason`}
            onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-base font-semibold tabular-nums outline-none placeholder:text-muted-foreground"
          />
          <span className="text-sm text-muted-foreground">
            {tab === 'buy' ? <Coin className="text-base" /> : 'shares'}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {chips.map((c) => {
            const why =
              tab === 'buy' && balanceOrNull === null
                ? 'Loading your balance'
                : c.value <= 0
                  ? tab === 'buy'
                    ? 'Not enough points'
                    : `You hold no ${sideLabel(market, held)} shares`
                  : tab === 'buy' && c.value > balance
                    ? 'Not enough points'
                    : null;
            const whyId = `${ids}-chip-${c.key}`;
            return (
              <Fragment key={c.key}>
                <button
                  type="button"
                  className={chip}
                  disabled={why !== null}
                  title={why ?? undefined}
                  aria-describedby={why ? whyId : undefined}
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
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span id={`${ids}-pct`}>
            {tab === 'buy' ? 'Share of balance' : `Share of your ${sideLabel(market, held)}`}
          </span>
          <span className="font-mono tabular-nums">{pct}%</span>
        </div>
        <Slider.Root
          min={0}
          max={100}
          step={1}
          value={[pct]}
          disabled={base <= 0}
          onValueChange={([v]) => fromPct(v ?? 0)}
          className="relative flex h-6 w-full touch-none items-center select-none data-[disabled]:opacity-40"
        >
          <Slider.Track className="relative h-1.5 grow rounded-full bg-muted">
            <Slider.Range className="absolute h-full rounded-full bg-accent" />
          </Slider.Track>
          <Slider.Thumb
            aria-labelledby={`${ids}-pct`}
            className="block size-5 rounded-full border-2 border-accent bg-background outline-none transition-transform duration-(--dur-instant) ease-(--ease-standard) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 [@media(hover:hover)]:hover:scale-110"
          />
        </Slider.Root>
      </div>

      <div data-quote className="grid grid-cols-2 gap-3">
        {SIDES.map((side) => {
          const price = Math.round(toSidePrice(market.probYes, side) * 100);
          return (
            <dl key={side} data-quote-side={side} className="min-w-0 rounded-md border border-(--hairline) px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 border-b border-(--hairline) pb-1.5 text-xs font-semibold">
                <dt className={`truncate ${side === 'yes' ? 'text-(--yes)' : 'text-(--no)'}`}>
                  {sideLabel(market, side)}
                </dt>
                <dd className="font-mono text-muted-foreground tabular-nums">
                  {oddsText(price, odds)}
                  {oddsUnit(odds)}
                </dd>
              </div>
              {quoteRows(side).map((r) => (
                <Row key={r.label} label={r.label}>
                  {r.value}
                </Row>
              ))}
            </dl>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side) => (
          <button
            key={side}
            type="button"
            data-side={side}
            disabled={blocked(side) || mutation.isPending}
            aria-describedby={`${ids}-reason`}
            onClick={() => place(side)}
            className={`inline-flex min-h-12 min-w-0 items-center justify-center rounded-md px-3 text-sm font-semibold transition-[background-color,filter] duration-(--dur-instant) ease-(--ease-standard) active:enabled:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 ${sideButton[side]}`}
          >
            <span className="truncate">
              {placing === side ? 'Placing order…' : `${tab === 'buy' ? 'Buy' : 'Sell'} ${sideLabel(market, side)}`}
            </span>
          </button>
        ))}
      </div>

      <div id={`${ids}-reason`} aria-live="polite" className="min-h-10 text-xs text-pretty">
        {errorText ? (
          <p role="alert" className="text-(--no)">
            {errorText}
          </p>
        ) : confirmation ? (
          <p data-trade-confirmation className="font-medium text-(--yes)">
            {confirmation}
          </p>
        ) : (
          <p className={invalid ? 'text-foreground' : 'text-muted-foreground'}>{reason}</p>
        )}
      </div>

      <p className="mt-auto text-xs text-muted-foreground">Practice points — no real value.</p>
    </section>
  );
}
