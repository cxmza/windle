import { useEffect, useState } from 'react';

type Props = {
  value: string;
  /** What is being copied, for the accessible name: "Copy wallet address". */
  label: string;
  className?: string;
};

type Status = 'idle' | 'copied' | 'failed';

export function CopyButton({ value, label, className = '' }: Props) {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const id = window.setTimeout(() => setStatus('idle'), 1800);
    return () => window.clearTimeout(id);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        data-status={status}
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-surface-raised/70 hover:text-foreground active:translate-y-px data-[status=copied]:text-accent-text ${className}`}
      >
        {/* TODO(motion): swap copy -> check glyph with a short draw-on */}
        <svg
          viewBox="0 0 20 20"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          {status === 'copied' ? (
            <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <>
              <rect x="7" y="7" width="9" height="9" rx="2" />
              <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
            </>
          )}
        </svg>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied' ? 'Copied to clipboard' : status === 'failed' ? 'Could not copy' : ''}
      </span>
    </>
  );
}
