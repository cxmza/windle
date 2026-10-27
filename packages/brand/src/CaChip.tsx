import { useEffect, useRef, useState } from 'react';
import { cn } from './cn.ts';
import { CheckIcon, CopyIcon, PumpFunIcon } from './SocialIcons.tsx';
import { pumpFunUrl, shortAddress } from './socials.ts';

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 1800;

const part =
  'inline-flex h-full items-center text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-foreground/15 active:text-foreground [@media(hover:hover)]:hover:bg-foreground/10 [@media(hover:hover)]:hover:text-foreground';

type Props = {
  /** The mint address; null renders nothing (see resolveCa / tokenCa). */
  address: string | null;
  /** `compact`: just a "CA" copy button, for the collapsed rail. */
  compact?: boolean;
  className?: string;
};

/**
 * Token contract chip: "CA 7xKX…pump", click to copy (announced through a polite live region), plus a link to the
 * coin on pump.fun. The full address is in the title and the accessible names.
 */
export function CaChip({ address, compact = false, className }: Props) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (address === null) return null;

  const copy = async () => {
    let next: CopyState = 'copied';
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      next = 'failed';
    }
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), RESET_MS);
  };

  const status = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : '';
  return (
    <div
      data-ca-chip
      data-copy-state={state === 'idle' ? undefined : state}
      className={cn(
        'inline-flex h-8 items-center overflow-hidden rounded-full border border-border/60 text-xs font-medium',
        className,
      )}
    >
      <button
        type="button"
        onClick={copy}
        title={address}
        aria-label={`Copy contract address ${address}`}
        className={cn(part, 'gap-1.5 pl-3', compact ? 'pr-3' : 'pr-2.5')}
      >
        <span className="tracking-[0.08em] text-foreground">CA</span>
        {compact ? null : (
          <span className="grid font-mono tabular-nums">
            <span className={cn('col-start-1 row-start-1', state !== 'idle' && 'invisible')}>
              {shortAddress(address)}
            </span>
            <span
              aria-hidden="true"
              className={cn('col-start-1 row-start-1 text-foreground', state === 'idle' && 'invisible')}
            >
              {status}
            </span>
          </span>
        )}
        {compact ? null : state === 'copied' ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </button>
      {compact ? null : (
        <a
          href={pumpFunUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on pump.fun"
          aria-label="Open on pump.fun (opens in a new tab)"
          className={cn(part, 'w-8 justify-center border-l border-border/60')}
        >
          <PumpFunIcon className="size-4" />
        </a>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
    </div>
  );
}
