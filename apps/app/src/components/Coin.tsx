import { WINDLE_MARK_PATH } from '@windle/brand';
import { type ComponentPropsWithRef, useState } from 'react';

type Props = Omit<ComponentPropsWithRef<'svg'>, 'children'> & {
  /** True when the number beside it already says "practice points" (e.g. a column header). */
  decorative?: boolean;
  /** Flip once on mount: a win or payout just landed. */
  flip?: boolean;
  /** A balance: the coin beats each time this value changes after the first render (never on mount). */
  beatOn?: number;
  /** `settle` drops the coin into place (a bet just moved the balance); `pulse` is a short scale beat. */
  beat?: 'pulse' | 'settle';
};

/**
 * The windle coin: the brand mark on a disc, sized to the surrounding text (1em). The unit of practice points, so it
 * carries the name for assistive tech; the balance is play money, not the pump.fun token.
 */
export function Coin({ decorative = false, flip = false, beatOn, beat = 'pulse', className, ...props }: Props) {
  const [seen, setSeen] = useState({ on: beatOn, n: 0 });
  if (!Object.is(seen.on, beatOn)) setSeen({ on: beatOn, n: seen.n + 1 });
  const tick = seen.n === 0 ? undefined : seen.n % 2 === 1 ? 'a' : 'b';
  const a11y = decorative
    ? ({ 'aria-hidden': true, focusable: false } as const)
    : ({ role: 'img', 'aria-label': 'practice points' } as const);
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: named via aria-label (role=img), or aria-hidden when decorative
    <svg
      data-coin
      data-flip={flip || undefined}
      data-beat={tick ? beat : undefined}
      data-tick={tick}
      viewBox="0 0 120 120"
      className={`inline-block size-[1em] shrink-0 align-[-0.14em] ${className ?? ''}`}
      {...a11y}
      {...props}
    >
      <circle cx="60" cy="60" r="59" className="fill-accent" />
      <circle cx="60" cy="60" r="51" fill="none" strokeWidth="3" className="stroke-accent-foreground/45" />
      <path
        d={WINDLE_MARK_PATH}
        transform="translate(60 60) scale(0.5) translate(-60 -60)"
        className="fill-accent-foreground"
      />
    </svg>
  );
}
