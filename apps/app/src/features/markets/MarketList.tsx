import type { CSSProperties, KeyboardEvent } from 'react';
import { deadlineLabel, formatSol } from './format';
import { OddsBlade } from './OddsBlade';
import { StatusPill } from './StatusPill';
import type { Market } from './types';

type Props = {
  open: readonly Market[];
  settled: readonly Market[];
  now: number;
  selectedId: string | null;
  onOpen: (id: string, trigger: HTMLElement) => void;
};

function onListKey(e: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-row-button]')];
  const i = rows.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
  rows[next]?.focus();
}

const cols = 'md:grid-cols-[6.5rem_minmax(0,1fr)_8.5rem_7.5rem_7rem]';

function Row({
  m,
  index,
  now,
  selected,
  onOpen,
}: {
  m: Market;
  index: number;
  now: number;
  selected: boolean;
  onOpen: Props['onOpen'];
}) {
  const resolved = m.status === 'shipped' || m.status === 'slashed';
  return (
    <li data-market-row style={{ '--i': index } as CSSProperties} className="border-b border-(--hairline)">
      <button
        type="button"
        data-row-button
        aria-current={selected || undefined}
        onClick={(e) => onOpen(m.id, e.currentTarget)}
        className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-3xl px-3 py-4 text-left transition-colors duration-(--dur-instant) ease-(--ease-standard) hover:bg-(--nav-hover) aria-[current]:bg-(--nav-hover) md:gap-x-6 md:px-4 md:py-5 ${cols}`}
      >
        <span className="flex items-center gap-2 max-md:col-span-2 max-md:justify-between">
          <span className="inline-flex h-7 items-center rounded-full border border-(--hairline) px-3 text-xs font-semibold tracking-[0.12em] text-accent-text">
            ${m.ticker}
          </span>
          <span className="font-mono text-sm text-muted-foreground tabular-nums md:hidden">
            {deadlineLabel(m, now)}
          </span>
        </span>

        <span className="flex min-w-0 flex-col gap-1 max-md:col-span-2">
          <span className="text-[0.9375rem] leading-snug font-medium text-foreground text-pretty">{m.promise}</span>
          <span className="text-sm text-muted-foreground">{m.team}</span>
        </span>

        <span className="flex flex-col gap-2">
          <span
            className={`font-mono text-[1.75rem] leading-none tabular-nums ${resolved ? 'text-muted-foreground' : ''}`}
          >
            {m.shipProbability}
            <span className="text-base text-muted-foreground">%</span>
            <span className="sr-only"> odds it ships</span>
          </span>
          <OddsBlade value={m.shipProbability} className="w-full max-w-32" />
        </span>

        <span className="text-right font-mono text-base tabular-nums md:text-left">
          {formatSol(m.collateralSol)}
          <span className="sr-only"> collateral</span>
        </span>

        <span className="flex items-center justify-end gap-2 max-md:hidden">
          {m.status === 'live' ? (
            <span className="font-mono text-base tabular-nums">
              {deadlineLabel(m, now)}
              <span className="sr-only"> left</span>
            </span>
          ) : (
            <StatusPill status={m.status} />
          )}
        </span>
      </button>
    </li>
  );
}

function Section({
  title,
  markets,
  offset,
  ...rest
}: { title: string; markets: readonly Market[]; offset: number } & Omit<Props, 'open' | 'settled'>) {
  if (markets.length === 0) return null;
  const id = `markets-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2
        id={id}
        className="flex items-baseline gap-3 px-3 text-kicker font-semibold uppercase text-muted-foreground md:px-4"
      >
        {title}
        <span className="font-mono tracking-normal tabular-nums">{markets.length}</span>
      </h2>
      <div
        aria-hidden="true"
        className={`hidden border-b border-(--hairline) px-4 pb-2 text-xs text-muted-foreground md:grid md:gap-x-6 ${cols}`}
      >
        <span>Ticker</span>
        <span>Promise</span>
        <span>Ship odds</span>
        <span>Collateral</span>
        <span className="text-right">Deadline</span>
      </div>
      <ol className="flex flex-col" onKeyDown={onListKey}>
        {markets.map((m, i) => (
          <Row
            key={m.id}
            m={m}
            index={offset + i}
            now={rest.now}
            selected={rest.selectedId === m.id}
            onOpen={rest.onOpen}
          />
        ))}
      </ol>
    </section>
  );
}

export function MarketList({ open, settled, ...rest }: Props) {
  return (
    <div className="flex flex-col gap-12">
      <Section title="Open" markets={open} offset={0} {...rest} />
      <Section title="Settled" markets={settled} offset={open.length} {...rest} />
    </div>
  );
}
