import { type CSSProperties, useState } from 'react';

type Props = { value: number; className?: string; enter?: boolean };

/** YES share in green over the NO remainder in a dimmed red: a 3px split bar, no glow. */
export function OddsBlade({ value, className, enter = false }: Props) {
  const [first] = useState(value);
  return (
    <span
      aria-hidden="true"
      className={`block h-[3px] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--no)_42%,var(--background))] ${className ?? ''}`}
    >
      <span
        data-odds-fill
        data-enter={(enter && value === first) || undefined}
        className="block h-full origin-left bg-(--yes)"
        style={{ '--odds': Math.max(0, Math.min(100, value)) / 100 } as CSSProperties}
      />
    </span>
  );
}
