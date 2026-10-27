import type { ApiMarket, MarketSide } from '@windle/shared';
import type { ReactNode } from 'react';
import { Digits } from '@/components/Digits';
import { formatShares } from '../format';
import { usePosition } from '../hooks';
import { Amount } from '../ui/Amount';
import { card, sectionTitle } from '../ui/styles';
import { sideLabel } from './market-view';
import { PayoutNote } from './PayoutNote';

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[0.8125rem] text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

type Props = { market: ApiMarket; hidePayout?: boolean; bare?: boolean; empty?: ReactNode };

export function PositionCard({ market, hidePayout = false, bare = false, empty = null }: Props) {
  const position = usePosition(market.slug);
  if (!position) return empty;
  const settled = position.settledAt !== null;
  const holds = position.yesShares > 0 || position.noShares > 0;
  if (!holds && !settled) return empty;

  const sides = (['yes', 'no'] as const).filter((s: MarketSide) =>
    s === 'yes' ? position.yesShares > 0 : position.noShares > 0,
  );
  const unrealized = settled ? 0 : position.valuePts - position.costBasisPts;

  return (
    <section aria-label="Your position" data-position-card className={`${bare ? '' : card} flex flex-col gap-4`}>
      <h2 className={bare ? 'sr-only' : sectionTitle}>Your position</h2>

      {sides.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {sides.map((s) => {
            const shares = s === 'yes' ? position.yesShares : position.noShares;
            const cost = s === 'yes' ? position.yesCostPts : position.noCostPts;
            return (
              <li key={s} className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`font-semibold ${s === 'yes' ? 'text-(--yes)' : 'text-(--no)'}`}>
                  {sideLabel(market, s)}
                </span>
                <span className="text-right text-foreground tabular-nums">
                  <Digits text={formatShares(shares)} value={shares} /> shares
                  {settled ? null : (
                    <span className="text-muted-foreground">
                      {' '}
                      · avg <Amount value={shares > 0 ? cost / shares : 0} format="price" per="/share" />
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-(--hairline) pt-3">
        {settled ? (
          <>
            <Cell label="Paid out">
              <Amount value={position.payoutPts ?? 0} roll />
            </Cell>
            <Cell label="Result">
              <span
                data-pnl={position.realizedPts > 0 ? 'up' : position.realizedPts < 0 ? 'down' : 'flat'}
                className={position.realizedPts > 0 ? 'text-(--gain)' : position.realizedPts < 0 ? 'text-(--no)' : ''}
              >
                <Amount value={position.realizedPts} format="signed" roll />
              </span>
            </Cell>
          </>
        ) : (
          <>
            <Cell label="Cost basis">
              <Amount value={position.costBasisPts} roll />
            </Cell>
            <Cell label="Value now">
              <Amount value={position.valuePts} roll />
            </Cell>
            <Cell label="Unrealized P&L">
              <span
                data-pnl={unrealized > 0 ? 'up' : unrealized < 0 ? 'down' : 'flat'}
                className={unrealized > 0 ? 'text-(--gain)' : unrealized < 0 ? 'text-(--no)' : ''}
              >
                <Amount value={unrealized} format="signed" roll />
              </span>
            </Cell>
            {position.realizedPts !== 0 ? (
              <Cell label="Realized P&L">
                <Amount value={position.realizedPts} format="signed" />
              </Cell>
            ) : null}
          </>
        )}
      </dl>

      {hidePayout ? null : <PayoutNote market={market} />}
    </section>
  );
}
