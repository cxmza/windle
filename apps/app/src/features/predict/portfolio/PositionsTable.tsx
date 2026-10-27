import { SIDE_LABELS } from '@windle/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { OddsNumber, OddsUnit } from '@/components/OddsNumber';
import { formatShares, probToPercent } from '../format';
import { Amount } from '../ui/Amount';
import { MarketStatusBadge } from '../ui/MarketStatusBadge';
import { Signed } from '../ui/Signed';
import { TierBadge } from '../ui/TierBadge';
import type { PositionRow } from './rows';

type Props = { rows: readonly PositionRow[] };

const th = 'px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground';
const td = 'px-3 py-3.5 align-middle [[data-density=compact]_&]:py-2';
const num = 'text-right font-mono tabular-nums';

export function PositionsTable({ rows }: Props) {
  return (
    <section
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable so the keyboard reaches off-screen columns
      tabIndex={0}
      aria-label="Positions table"
      className="overflow-x-auto rounded-lg border border-(--hairline) bg-surface"
    >
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-(--hairline) text-left">
            <th scope="col" className={`${th} w-[28%]`}>
              Market
            </th>
            <th scope="col" className={th}>
              Side
            </th>
            <th scope="col" className={`${th} text-right`}>
              Shares
            </th>
            <th scope="col" className={`${th} text-right`}>
              Avg cost
            </th>
            <th scope="col" className={`${th} text-right`}>
              Odds
            </th>
            <th scope="col" className={`${th} text-right`}>
              Value
            </th>
            <th scope="col" className={`${th} text-right`}>
              P&amp;L
            </th>
            <th scope="col" className={th}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const m = r.view.market;
            return (
              <tr
                key={r.key}
                data-position-row
                style={{ '--i': i } as CSSProperties}
                className="border-b border-(--hairline) last:border-b-0"
              >
                <td className={td}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      to={`/m/${m.slug}`}
                      className="line-clamp-2 rounded-sm font-medium text-pretty text-foreground underline decoration-transparent underline-offset-2 transition-colors duration-(--dur-instant) [@media(hover:hover)]:hover:decoration-current"
                    >
                      {m.statement}
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {m.project.name}
                      <span className="font-semibold tracking-[0.12em] text-accent-text">${m.project.ticker}</span>
                      <TierBadge tier={m.tier} />
                    </span>
                  </div>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {r.side ? SIDE_LABELS[m.tier][r.side] : <span className="text-muted-foreground">Closed out</span>}
                </td>
                <td className={`${td} ${num}`}>{r.side ? formatShares(r.shares) : '—'}</td>
                <td className={`${td} ${num} whitespace-nowrap`}>
                  {r.avgCost === null ? '—' : <Amount value={r.avgCost} format="price" per="/share" />}
                </td>
                <td className={`${td} ${num}`}>
                  {r.price === null || r.view.settled ? (
                    '—'
                  ) : (
                    <>
                      <OddsNumber value={probToPercent(r.price)} />
                      <OddsUnit className="text-muted-foreground" />
                    </>
                  )}
                </td>
                <td className={`${td} ${num}`}>
                  <Amount value={r.valuePts} className="justify-end" />
                </td>
                <td className={`${td} ${num}`}>
                  <Signed value={r.pnlPts} />
                </td>
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-2">
                    <MarketStatusBadge market={m} />
                    {r.first && r.view.settled ? (
                      <span data-paid-out className="text-xs text-muted-foreground">
                        {m.status === 'voided' ? 'Refunded' : 'Paid out'}{' '}
                        <Amount value={r.view.payoutPts ?? 0} className="font-mono text-foreground" />
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
