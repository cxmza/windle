import { type Ref, useId } from 'react';

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
      className={`flex h-8 items-center gap-2 rounded-md border border-(--control-border) bg-background px-2.5 focus-within:border-border-accent ${className ?? ''}`}
    >
      <svg
        viewBox="0 0 20 20"
        width="14"
        height="14"
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
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
      />
    </div>
  );
}
