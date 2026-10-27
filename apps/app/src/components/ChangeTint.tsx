import { type ReactNode, useState } from 'react';

type Props = {
  /** The number behind the text: decides the direction. */
  value: number;
  /** What is shown: a tint fires only when this changes too, so float noise and format switches stay quiet. */
  text: string;
  children: ReactNode;
};

/** Briefly washes its content toward the direction of a change (gain when it rises, loss when it falls). */
export function ChangeTint({ value, text, children }: Props) {
  const [s, setS] = useState<{ value: number; text: string; dir?: 'up' | 'down'; n: number }>({ value, text, n: 0 });
  if (s.text !== text || s.value !== value) {
    const moved = s.text !== text && s.value !== value;
    setS({ value, text, dir: moved ? (value > s.value ? 'up' : 'down') : s.dir, n: moved ? s.n + 1 : s.n });
  }
  return (
    <span data-tint={s.dir} data-tick={s.dir ? (s.n % 2 === 0 ? 'a' : 'b') : undefined}>
      {children}
    </span>
  );
}
