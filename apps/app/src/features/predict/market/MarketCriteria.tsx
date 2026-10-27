import { useState } from 'react';

const LONG_CRITERIA = 220;

export function MarketCriteria({ text }: { text: string }) {
  const long = text.length > LONG_CRITERIA;
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">Resolution criteria</p>
      <p
        id="criteria-text"
        className={`text-sm leading-relaxed text-pretty text-foreground ${long && !open ? 'line-clamp-3' : ''}`}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="criteria-text"
          onClick={() => setOpen((v) => !v)}
          className="-ml-1 inline-flex min-h-8 items-center rounded-md px-1 text-xs font-medium text-accent-text transition-colors duration-(--dur-instant) hover:underline active:opacity-80"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}
