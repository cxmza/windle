import type { ApiMarket } from '@windle/shared';
import { useState } from 'react';
import { Time } from '@/components/Time';
import { UserAvatar } from '@/features/media/UserAvatar';
import { formatPrice, formatShares } from '../format';
import { useMyAddress, useTrades } from '../hooks';
import { Amount } from '../ui/Amount';
import { card, sectionTitle } from '../ui/styles';
import { BOT_HINT, isBotTrade } from './bot-copy';
import { sideLabel } from './market-view';

const LIMIT = 20;

/**
 * Rows already on screen at first paint stay still; later ones open from the top and push the list down. The row
 * pushed out at the bottom is kept as a hidden tail that collapses in step, so the list height does not jump.
 */
function useFreshRows(ids: readonly string[]) {
  const [first, setFirst] = useState<{ ids: ReadonlySet<string>; tail: string | undefined } | null>(null);
  if (first === null && ids.length > 0) setFirst({ ids: new Set(ids.slice(0, LIMIT)), tail: ids[LIMIT] });
  return {
    fresh: (id: string) => first !== null && !first.ids.has(id),
    tail: (id: string, i: number) => (i < LIMIT ? undefined : id === first?.tail ? 'still' : 'leave'),
  };
}

export function ActivityList({ market, bare = false }: { market: ApiMarket; bare?: boolean }) {
  const trades = useTrades(market.slug, LIMIT + 1);
  const rows = useFreshRows(trades.map((t) => t.id));
  const me = useMyAddress();
  // One avatar column or none, so rows with and without a picture keep their text on the same line.
  const withAvatars = trades.some((t) => t.avatar);

  return (
    <section aria-labelledby="activity-title" className={`${bare ? '' : card} flex flex-col gap-3`}>
      <h2 id="activity-title" className={bare ? 'sr-only' : sectionTitle}>
        Activity
      </h2>
      {trades.length === 0 ? (
        <p className="text-sm text-muted-foreground">No trades yet. The first one sets the price.</p>
      ) : (
        <ul data-activity className="flex flex-col">
          {trades.map((t, i) => {
            const mine = t.by === me;
            const bot = isBotTrade(t);
            const tail = rows.tail(t.id, i);
            return (
              <li
                key={t.id}
                data-activity-row
                data-fresh={rows.fresh(t.id) || undefined}
                data-tail={tail}
                aria-hidden={tail ? true : undefined}
                data-mine={mine || undefined}
                data-bot={bot || undefined}
                className={mine ? 'rounded-lg bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-2 -mx-2' : ''}
              >
                <div>
                  <div
                    data-activity-body
                    className={`flex items-center justify-between gap-4 py-1.5 text-[0.8125rem] ${i > 0 ? 'border-t border-(--hairline)' : ''} ${bot ? 'opacity-70' : ''}`}
                  >
                    {withAvatars ? <UserAvatar address={t.by} image={t.avatar} className="size-6" /> : null}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate">
                        <span className="text-muted-foreground">{t.action === 'buy' ? 'Bought' : 'Sold'} </span>
                        <span className={`font-semibold ${t.side === 'yes' ? 'text-(--yes)' : 'text-(--no)'}`}>
                          {sideLabel(market, t.side)}
                        </span>
                        {bot ? (
                          <span
                            data-bot-badge
                            title={BOT_HINT}
                            className="ml-2 cursor-help rounded-xs border border-(--hairline) px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground"
                          >
                            BOT
                            <span className="sr-only">: {BOT_HINT}</span>
                          </span>
                        ) : null}
                        {mine ? (
                          <span className="ml-2 rounded-sm border border-(--hairline) px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                            You
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatShares(t.shares)} shares @ {formatPrice(t.shares > 0 ? t.costPts / t.shares : 0)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <p className="font-mono font-medium tabular-nums">
                        <Amount value={t.costPts} />
                      </p>
                      <Time iso={t.at} format="ago" className="text-xs text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
