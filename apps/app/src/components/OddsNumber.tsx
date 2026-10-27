import { useEffect, useRef, useState } from 'react';
import { usePref } from '@/features/settings/prefs';
import { useReducedMotion } from '@/lib/media';
import { cssDuration, decelerate } from '@/lib/motion';
import { oddsText, oddsUnit } from '@/lib/odds';
import { Digits } from './Digits';

type Props = {
  value: number;
  /** Count up from 0 on mount (the hero), then roll digits on change like everywhere else. */
  enter?: boolean;
  delayMs?: number;
};

/** The "%" after an <OddsNumber />; nothing in decimal format. */
export function OddsUnit({ className }: { className?: string }) {
  const unit = oddsUnit(usePref('odds'));
  return unit ? <span className={className}>{unit}</span> : null;
}

export function OddsNumber({ value, enter = false, delayMs = 0 }: Props) {
  const reduced = useReducedMotion();
  const format = usePref('odds');
  const [counting, setCounting] = useState(enter && !reduced);
  const out = useRef<HTMLSpanElement>(null);
  const target = useRef(value);

  useEffect(() => {
    target.current = value;
  }, [value]);

  useEffect(() => {
    if (!counting) return;
    const el = out.current;
    const ms = cssDuration('--dur-slower', 700) + 200;
    let start = -1;
    let raf = requestAnimationFrame(function frame(t) {
      if (start < 0) start = t + delayMs;
      const k = Math.min(1, Math.max(0, (t - start) / ms));
      if (el) el.textContent = String(Math.round(target.current * decelerate(k)));
      if (k < 1) raf = requestAnimationFrame(frame);
      else setCounting(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [counting, delayMs]);

  if (counting && !reduced && format === 'percent') {
    return (
      <>
        <span
          ref={out}
          aria-hidden="true"
          className="inline-block text-right"
          style={{ minWidth: `${String(value).length}ch` }}
        >
          0
        </span>
        <span className="sr-only">{value}</span>
      </>
    );
  }
  return <Digits key={format} text={oddsText(value, format)} />;
}
