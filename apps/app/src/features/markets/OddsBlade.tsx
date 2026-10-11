type Props = { value: number; className?: string };

export function OddsBlade({ value, className }: Props) {
  return (
    <span aria-hidden="true" className={`block h-0.5 overflow-hidden rounded-full bg-surface-navy ${className ?? ''}`}>
      <span
        className="block h-full origin-left rounded-full bg-glow shadow-[0_0_8px_var(--glow-soft)]"
        style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }}
      />
    </span>
  );
}
