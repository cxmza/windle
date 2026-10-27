import type { ApiImage, LeaderboardEntry, LeaderboardMe } from '@windle/shared';
import { Link } from 'react-router';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { buttonClass } from '@/components/Button';
import { PageHeading } from '@/components/PageHeading';
import { Time } from '@/components/Time';
import { SmartImage } from '@/features/media/SmartImage';
import { shortAddress } from '@/lib/format';
import { useLeaderboard } from '../predict/hooks';
import { Amount } from '../predict/ui/Amount';
import { PracticeBadge } from '../predict/ui/PracticeBadge';
import { Signed } from '../predict/ui/Signed';

const th =
  'px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5';
const td = 'px-3 py-2.5 align-middle first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5 [[data-density=compact]_&]:py-1.5';
const num = 'text-right font-mono tabular-nums';

function Avatar({ address, image }: { address: string; image?: ApiImage | null | undefined }) {
  if (image) {
    return (
      <SmartImage
        image={image}
        preset="avatar64"
        alt=""
        className="size-8 shrink-0 rounded-full border border-(--hairline)"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-avatar
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-(--hairline) bg-muted font-mono text-xs font-semibold text-muted-foreground select-none"
    >
      {address.slice(0, 2)}
    </span>
  );
}

function Wallet({ address, me, avatar }: { address: string; me: boolean; avatar?: ApiImage | null | undefined }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar address={address} image={avatar} />
      <span className="truncate font-mono text-[0.8125rem]" title={address}>
        {shortAddress(address)}
      </span>
      {me ? (
        <span className="shrink-0 rounded-sm border border-(--hairline) px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          You
        </span>
      ) : null}
    </span>
  );
}

function RankCell({ rank }: { rank: number }) {
  return (
    <span
      data-rank={rank}
      className={`font-mono tabular-nums ${rank <= 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
    >
      {/* TODO(motion): rank change — slide the row to its new place and nudge the number up or down */}
      {rank}
    </span>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col rounded-lg border border-(--hairline) bg-surface">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="flex h-12 items-center gap-3 border-b border-(--hairline) px-4 last:border-b-0">
          <div className="size-8 rounded-full bg-muted/50 motion-safe:animate-pulse" />
          <div className="h-3.5 w-48 rounded-sm bg-muted/50 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function YourRank({ me }: { me: LeaderboardMe }) {
  return (
    <section
      aria-label="Your rank"
      data-your-rank
      className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-border-strong bg-surface-raised px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span data-rank={me.rank ?? 'none'} className="font-mono text-base font-semibold tabular-nums">
          {me.rank === null ? '—' : `#${me.rank}`}
        </span>
        <Wallet address={me.address} me={false} avatar={me.avatar} />
      </div>
      <p className="flex items-baseline gap-4 text-sm">
        {me.rank === null ? (
          <span className="text-muted-foreground">Make a trade to get on the board.</span>
        ) : (
          <span className="text-muted-foreground">Outside the top 100</span>
        )}
        <span className="font-mono tabular-nums">
          <Amount value={me.netWorthPts} />
        </span>
        <Signed value={me.pnlPts} />
      </p>
    </section>
  );
}

function Row({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }) {
  return (
    <tr
      data-leaderboard-row
      data-me={mine || undefined}
      aria-current={mine ? 'true' : undefined}
      className={`border-b border-(--hairline) last:border-b-0 ${mine ? 'bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]' : ''}`}
    >
      <td className={`${td} w-14`}>
        <RankCell rank={entry.rank} />
      </td>
      <td className={`${td} min-w-0`}>
        <Wallet address={entry.address} me={mine} avatar={entry.avatar} />
      </td>
      <td className={`${td} ${num}`}>
        <Amount value={entry.netWorthPts} className="justify-end" />
      </td>
      <td className={`${td} ${num}`}>
        <Signed value={entry.pnlPts} />
      </td>
      <td className={`${td} ${num} hidden sm:table-cell`}>{entry.marketsTraded}</td>
    </tr>
  );
}

export function LeaderboardPage() {
  const query = useLeaderboard();
  const board = query.data;

  const heading = (
    <PageHeading
      title="Leaderboard"
      lede="The top 100 traders by net worth: balance plus open positions at today's prices."
    />
  );

  if (!board) {
    return (
      <>
        {heading}
        {query.isError ? (
          <ApiUnavailable error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : (
          <>
            <span role="status" className="sr-only">
              Loading the leaderboard…
            </span>
            <Skeleton />
          </>
        )}
      </>
    );
  }

  const me = board.me;
  const inTop = me !== null && board.entries.some((e) => e.address === me.address);

  return (
    <>
      {heading}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <PracticeBadge />
          {board.rankedTraders} ranked {board.rankedTraders === 1 ? 'trader' : 'traders'} · everyone starts with{' '}
          <Amount value={board.startingBalancePts} format="whole" />
        </span>
        <span>
          Updated <Time iso={board.updatedAt} format="ago" />
        </span>
      </div>

      {board.entries.length === 0 ? (
        <section
          data-leaderboard-empty
          className="flex max-w-xl flex-col items-start gap-4 rounded-2xl border border-(--hairline) bg-surface p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-foreground">Nobody is ranked yet</h2>
            <p className="text-sm text-muted-foreground">
              Only traders are ranked. Take a side on a market and your name goes on the board.
            </p>
          </div>
          <Link to="/" className={buttonClass('primary', 'md')}>
            Browse markets
          </Link>
        </section>
      ) : (
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable so the keyboard reaches off-screen columns
          tabIndex={0}
          aria-label="Leaderboard table"
          className="overflow-x-auto rounded-lg border border-(--hairline) bg-surface"
        >
          <table className="w-full min-w-[22rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-(--hairline) text-left">
                <th scope="col" className={th}>
                  Rank
                </th>
                <th scope="col" className={th}>
                  Trader
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Net worth
                </th>
                <th scope="col" className={`${th} text-right`}>
                  P&amp;L
                </th>
                <th scope="col" className={`${th} hidden text-right sm:table-cell`}>
                  Markets
                </th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((entry) => (
                <Row key={entry.address} entry={entry} mine={me?.address === entry.address} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {me && !inTop ? <YourRank me={me} /> : null}
    </>
  );
}
