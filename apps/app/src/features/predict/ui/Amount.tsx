import { Coin } from '@/components/Coin';
import { Digits } from '@/components/Digits';
import { formatCompactPts, formatPrice, formatPts, formatPtsWhole, formatSignedPts } from '../format';

type Format = 'fine' | 'whole' | 'compact' | 'signed' | 'price';

type Props = {
  value: number;
  format?: Format;
  /** Roll changed digits (see Digits). */
  roll?: boolean;
  /** Coin motion: `flip` once on mount (a win/payout), `pulse`/`settle` when the value changes (a balance). */
  coin?: 'flip' | 'pulse' | 'settle';
  /** Text after the coin, e.g. "/share". */
  per?: string;
  className?: string;
};

const TEXT: Record<Format, (n: number) => string> = {
  fine: formatPts,
  whole: formatPtsWhole,
  compact: formatCompactPts,
  signed: formatSignedPts,
  price: formatPrice,
};

/** A practice-points amount: the number followed by the windle coin. Use `formatPtsUnit` where an icon cannot render. */
export function Amount({ value, format = 'fine', roll = false, coin, per, className }: Props) {
  const text = TEXT[format](value);
  return (
    <span data-amount className={`inline-flex items-baseline gap-[0.3em] whitespace-nowrap ${className ?? ''}`}>
      <span>{roll ? <Digits text={text} value={value} /> : text}</span>{' '}
      <Coin
        className="translate-y-[0.14em]"
        flip={coin === 'flip'}
        beatOn={coin === 'pulse' || coin === 'settle' ? value : undefined}
        beat={coin === 'settle' ? 'settle' : 'pulse'}
      />
      {per ? <span className="text-muted-foreground">{per}</span> : null}
    </span>
  );
}
