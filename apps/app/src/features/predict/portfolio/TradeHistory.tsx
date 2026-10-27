import { type ApiMarket, type ApiTrade, SIDE_LABELS } from '@windle/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '@/lib/format';
import { formatPrice, formatShares } from '../format';
import { Amount } from '../ui/Amount';

const PAGE = 15;

type Props = { trades: readonly ApiTrade[]; markets: readonly ApiMarket[] };

export function TradeHistory({ trades, markets }: Props) {
  const [shown, setShown] = useState(PAGE);
  const byId = new Map(markets.map((m) => [m.id, m]));
  const rows = trades.slice(0, shown);
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col rounded-lg border border-(--hairline) bg-surface">
        {rows.map((t) => {
          const m = byId.get(t.marketId);
          const buy = t.action === 'buy';
          const label = m ? SIDE_LABELS[m.tier][t.side] : t.side === 'yes' ? 'Yes' : 'No';
          return (
            <li
              key={t.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-(--hairline) px-4 py-3 last:border-b-0 [[data-density=compact]_&]:py-2"
            >
              <p className="min-w-0 text-sm text-foreground">
                <span className="font-medium">{buy ? 'Bought' : 'Sold'}</span>{' '}
                <span className="font-mono tabular-nums">{formatShares(t.shares)}</span> {label}
                {m ? (
                  <>
                    {' '}
                    <span className="text-muted-foreground">in</span>{' '}
                    <Link
                      to={`/m/${m.slug}`}
                      className="underline decoration-(--hairline) underline-offset-2 [@media(hover:hover)]:hover:decoration-current"
                    >
                      {m.statement}
                    </Link>
                  </>
                ) : null}
              </p>
              <p className="text-right font-mono text-sm tabular-nums text-foreground">
                <Amount value={buy ? -t.costPts : t.costPts} format="signed" />
              </p>
              <p className="col-span-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <time dateTime={t.at}>{formatDateTime(t.at)}</time>
                <span>
                  at <span className="font-mono tabular-nums">{formatPrice(t.costPts / t.shares)}</span> per share
                </span>
              </p>
            </li>
          );
        })}
      </ol>
      {trades.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="inline-flex min-h-9 w-fit items-center rounded-md border border-(--hairline) px-3 text-sm font-medium transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)"
        >
          Show more ({trades.length - shown} older)
        </button>
      ) : null}
    </div>
  );
}
