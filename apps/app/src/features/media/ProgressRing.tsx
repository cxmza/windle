type Props = {
  /** 0..1, or null while the length is unknown. */
  value: number | null;
  label: string;
  className?: string;
};

/** A determinate ring on a 36-unit viewBox; the caller sizes it with a `size-*` class. */
export function ProgressRing({ value, label, className = 'size-14' }: Props) {
  const pct = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(pct === null ? {} : { 'aria-valuenow': pct })}
      className={`relative inline-flex shrink-0 items-center justify-center text-foreground ${className}`}
    >
      <svg
        viewBox="0 0 36 36"
        aria-hidden="true"
        className={`size-full -rotate-90 ${pct === null ? 'motion-safe:animate-spin' : ''}`}
      >
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-current opacity-25" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - (pct ?? 28)}
          className="stroke-(--accent-text) transition-[stroke-dashoffset] duration-(--dur-fast) ease-linear motion-reduce:transition-none"
        />
      </svg>
      {pct === null ? null : (
        <span aria-hidden="true" className="absolute font-mono text-xs tabular-nums">
          {pct}
        </span>
      )}
    </div>
  );
}
