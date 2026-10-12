import { type CSSProperties, useState } from 'react';

type Props = { value: number; className?: string; enter?: boolean };

export function OddsBlade({ value, className, enter = false }: Props) {
  const [first] = useState(value);
  return (
    <span aria-hidden="true" className={`block h-0.5 overflow-hidden rounded-full bg-surface-navy ${className ?? ''}`}>
      <span
        data-odds-fill
        data-enter={(enter && value === first) || undefined}
        className="block h-full origin-left rounded-full bg-glow shadow-[0_0_8px_var(--glow-soft)]"
        style={{ '--odds': Math.max(0, Math.min(100, value)) / 100 } as CSSProperties}
      />
    </span>
  );
}
