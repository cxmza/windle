import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChangeTint } from '@/components/ChangeTint';
import { Coin } from '@/components/Coin';
import { Digits } from '@/components/Digits';
import { formatPts } from '../format';
import type { PortfolioView } from '../selectors';
import { PracticeBadge } from '../ui/PracticeBadge';
import { Signed } from '../ui/Signed';

type Props = { portfolio: PortfolioView };

function Tile({ label, children, sub }: { label: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <dl className="m-0 flex min-w-0 flex-col gap-0.5 px-4 py-3">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 flex flex-col gap-0.5">
        <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{children}</span>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </dd>
    </dl>
  );
}

function Rolling({ value }: { value: number }) {
  const text = formatPts(value);
  return <Digits text={text} value={value} />;
}

const Unit = () => <Coin className="ml-1 text-sm" />;

export function Summary({ portfolio: p }: Props) {
  return (
    <section aria-label="Summary">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-(--hairline) bg-(--hairline) *:bg-background lg:grid-cols-5">
        <Tile
          label={
            <>
              Balance <PracticeBadge />
            </>
          }
        >
          <ChangeTint value={p.balancePts} text={formatPts(p.balancePts)}>
            <Rolling value={p.balancePts} />
          </ChangeTint>
          <Coin className="ml-1 text-sm" beatOn={p.balancePts} />
        </Tile>
        <Tile label="In positions">
          <Rolling value={p.positionsValuePts} />
          <Unit />
        </Tile>
        <Tile label="Equity" sub="Balance plus positions">
          <Rolling value={p.equityPts} />
          <Unit />
        </Tile>
        <Tile
          label="Profit and loss"
          sub={
            <>
              Realized <Signed value={p.realizedPts} /> · Unrealized <Signed value={p.unrealizedPts} />
            </>
          }
        >
          <ChangeTint value={p.pnlPts} text={formatPts(p.pnlPts)}>
            <Signed value={p.pnlPts} roll />
          </ChangeTint>
          <Unit />
        </Tile>
        <Tile
          label="Leaderboard rank"
          sub={
            <Link
              to="/leaderboard"
              className="rounded-sm text-accent-text underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {p.rank === null ? 'Trade to get ranked' : 'See the top 100'}
            </Link>
          }
        >
          {/* TODO(motion): rank change — roll the number and nudge it up or down when the rank moves */}
          {p.rank === null ? <span data-rank="none">—</span> : <span data-rank={p.rank}>#{p.rank}</span>}
        </Tile>
      </div>
    </section>
  );
}
