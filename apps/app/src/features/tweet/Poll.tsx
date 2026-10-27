import type { XPoll } from '@windle/shared';
import type { CSSProperties } from 'react';
import { useClock } from '@/lib/clock';
import { formatCompact, formatExact } from '@/lib/format';
import { useServerOffset } from '@/lib/server-time';
import { formatRemaining } from '@/lib/time';

function useIsFinal(poll: XPoll): { final: boolean; remainingMs: number | null } {
  const now = useClock('second') + useServerOffset();
  const end = poll.endsAt ? Date.parse(poll.endsAt) : null;
  const final = poll.closed || (end !== null && end <= now);
  return { final, remainingMs: end === null ? null : end - now };
}

/** Options with their share of the votes; once the poll is over the leading option is marked. */
export function Poll({ poll }: { poll: XPoll }) {
  const { final, remainingMs } = useIsFinal(poll);
  const sum = poll.options.reduce((n, o) => n + o.votes, 0);
  const total = Math.max(poll.totalVotes, sum);
  const top = Math.max(...poll.options.map((o) => o.votes));

  return (
    <section data-poll aria-label="Poll" className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1">
        {poll.options.map((o) => {
          const pct = total > 0 ? (o.votes / total) * 100 : 0;
          const win = final && top > 0 && o.votes === top;
          return (
            <li
              key={o.label}
              data-poll-option
              data-winner={win || undefined}
              className="relative flex h-8 items-center justify-between gap-3 overflow-hidden rounded-md border border-(--hairline) px-2.5 text-sm"
            >
              <span
                aria-hidden="true"
                data-poll-fill
                style={{ '--fill': pct / 100 } as CSSProperties}
                className={`absolute inset-0 ${win ? 'bg-accent/40' : 'bg-muted'}`}
              />
              <span className={`relative min-w-0 truncate ${win ? 'font-semibold' : ''} text-foreground`}>
                {win ? <span aria-hidden="true">✓ </span> : null}
                {o.label}
              </span>
              <span className="relative shrink-0 font-mono text-xs tabular-nums">
                {pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%
                <span className="sr-only">
                  , {formatExact(o.votes)} {o.votes === 1 ? 'vote' : 'votes'}
                  {win ? ', leading' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-1.5 font-mono text-xs text-muted-foreground">
        <span className="tabular-nums" title={formatExact(total)}>
          {formatCompact(total)} {total === 1 ? 'vote' : 'votes'}
        </span>
        <span aria-hidden="true">·</span>
        <span data-poll-status className="tabular-nums">
          {final ? 'Final results' : remainingMs === null ? 'Poll open' : `Ends in ${formatRemaining(remainingMs)}`}
        </span>
      </p>
    </section>
  );
}
