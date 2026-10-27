import type { ApiMarket } from '@windle/shared';
import { usePosition } from '../hooks';
import { Amount } from '../ui/Amount';

/** What a settled market did for the viewer. Payouts are automatic, so this is a statement, never a button. */
export function PayoutNote({ market }: { market: ApiMarket }) {
  const position = usePosition(market.slug);
  if (!position || position.settledAt === null) return null;
  const paid = position.payoutPts ?? 0;
  const held = position.yesShares > 0 || position.noShares > 0;
  return (
    <p data-payout-note className="text-sm font-medium text-(--yes) empty:hidden">
      {paid > 0 ? (
        <>
          {market.status === 'voided' ? 'Refunded ' : 'Paid out '}
          <Amount value={paid} coin={market.status === 'voided' ? undefined : 'flip'} />.
        </>
      ) : held ? (
        <span className="font-normal text-muted-foreground">
          Your shares were on the losing side, so nothing was paid out.
        </span>
      ) : null}
    </p>
  );
}
