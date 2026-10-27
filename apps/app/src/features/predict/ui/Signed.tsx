import { Digits } from '@/components/Digits';
import { formatSignedPts, SIGN_CLASS, signOf } from '../format';

/** Points with an explicit sign and a gain/loss colour. The sign carries the meaning, the colour only reinforces it. */
export function Signed({ value, className, roll = false }: { value: number; className?: string; roll?: boolean }) {
  return (
    <span className={`font-mono tabular-nums ${SIGN_CLASS[signOf(value)]} ${className ?? ''}`}>
      {roll ? <Digits text={formatSignedPts(value)} value={value} /> : formatSignedPts(value)}
    </span>
  );
}
