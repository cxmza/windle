import type { MarketStatus } from './types';

const tone: Record<MarketStatus, string> = {
  live: 'border-(--hairline) text-muted-foreground',
  settling: 'border-glow/40 text-glow',
  shipped: 'border-transparent bg-glow/12 text-glow',
  slashed: 'border-(--slash-warm)/50 text-(--slash-warm)',
};

export function StatusPill({ status }: { status: MarketStatus }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium tracking-wide lowercase ${tone[status]}`}
    >
      {status}
    </span>
  );
}
