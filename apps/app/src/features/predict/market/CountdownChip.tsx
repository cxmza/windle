import type { ApiMarket } from '@windle/shared';
import { useClock } from '@/lib/clock';
import { useServerOffset } from '@/lib/server-time';
import { RISK_CLASS } from '../ui/risk';
import { chipState, formatCountdown } from './countdown';

const FINAL_MINUTE_MS = 60_000;

/** The preset and the time left, tinted by how risky the duration is. */
export function CountdownChip({ market }: { market: ApiMarket }) {
  const open = market.status === 'open';
  const now = useClock('second', open) + useServerOffset();
  const state = chipState(market, now);
  const tone = RISK_CLASS[state.tone];
  const finalMinute = state.kind === 'counting' && state.remainingMs < FINAL_MINUTE_MS;
  const beat = finalMinute ? (Math.floor(state.remainingMs / 1000) % 2 === 0 ? 'a' : 'b') : undefined;
  return (
    <p
      data-countdown-chip
      data-risk={state.tone}
      data-final-minute={finalMinute || undefined}
      data-beat={beat}
      className={`inline-flex h-7 w-fit items-center gap-2 rounded-md border px-2.5 font-mono text-xs font-semibold tabular-nums ${tone.border} ${tone.wash} ${tone.text}`}
    >
      <span>{state.label}</span>
      <span aria-hidden="true">•</span>
      {state.kind === 'counting' ? (
        <time dateTime={market.deadline}>{formatCountdown(state.remainingMs)}</time>
      ) : (
        <span>{state.text}</span>
      )}
    </p>
  );
}
