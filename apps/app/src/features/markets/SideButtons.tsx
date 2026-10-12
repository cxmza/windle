import { useState } from 'react';
import { sidePrice } from './format';
import type { Market } from './types';

const sideButton =
  'flex min-h-14 flex-1 items-center justify-between gap-3 rounded-full px-5 text-sm font-semibold transition-[background-color,border-color,color,translate] duration-(--dur-instant) ease-(--ease-standard) active:translate-y-px';

type Props = { market: Market; sample: boolean };

export function SideButtons({ market, sample }: Props) {
  const [noted, setNoted] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setNoted(true)}
          className={`${sideButton} bg-glow text-ink-inverse hover:bg-[color-mix(in_oklab,var(--glow)_88%,var(--foreground))]`}
        >
          <span className="tracking-[0.08em] uppercase">Ship</span>
          <span className="font-mono tabular-nums">{sidePrice(market, 'ship')}</span>
        </button>
        <button
          type="button"
          onClick={() => setNoted(true)}
          className={`${sideButton} border border-(--slash-warm)/70 bg-background text-foreground hover:border-(--slash-warm) hover:bg-[color-mix(in_oklab,var(--slash-warm)_10%,var(--background))]`}
        >
          <span className="tracking-[0.08em] uppercase">Slash</span>
          <span className="font-mono tabular-nums">{sidePrice(market, 'slash')}</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Price per share in SOL; a share pays 1 SOL if its side wins.</p>
      <p role="status" className="min-h-4 text-xs text-accent-text">
        {noted ? `Trading is not live yet${sample ? ', this is sample data' : ''}. Nothing was placed.` : null}
      </p>
    </div>
  );
}
