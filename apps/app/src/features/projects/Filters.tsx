import { type Ref, useId } from 'react';
import type { MarketStatus } from '../markets/types';
import { STATUSES } from './types';

const pill =
  'inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium capitalize transition-colors duration-(--dur-instant) ease-(--ease-standard) aria-pressed:border-transparent aria-pressed:bg-glow aria-pressed:text-ink-inverse border-(--hairline) text-muted-foreground [@media(hover:hover)]:hover:enabled:not-aria-pressed:bg-(--nav-hover) [@media(hover:hover)]:hover:enabled:not-aria-pressed:text-foreground';

type StatusPillsProps = {
  value: readonly MarketStatus[];
  onChange: (next: MarketStatus[]) => void;
};

export function StatusFilter({ value, onChange }: StatusPillsProps) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">Filter by status</legend>
      {STATUSES.map((s) => {
        const on = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(STATUSES.filter((x) => (x === s ? !on : value.includes(x))))}
            className={pill}
          >
            {s}
          </button>
        );
      })}
    </fieldset>
  );
}

type SearchProps = {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

export function SearchField({ value, onChange, label = 'Search projects', className, ref }: SearchProps) {
  const id = useId();
  return (
    <div
      className={`flex h-11 items-center gap-2.5 rounded-full border border-(--hairline) bg-background/40 px-4 focus-within:border-border-accent ${className ?? ''}`}
    >
      <svg
        viewBox="0 0 20 20"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
        className="shrink-0 text-muted-foreground"
      >
        <circle cx="9" cy="9" r="5.5" />
        <path d="M13.5 13.5L17 17" strokeLinecap="round" />
      </svg>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search name, ticker or promise"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
      />
    </div>
  );
}
