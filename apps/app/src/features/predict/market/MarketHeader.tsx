import type { ApiMarket } from '@windle/shared';
import { DropdownMenu } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { ChangeTint } from '@/components/ChangeTint';
import { Monogram } from '@/components/Monogram';
import { OddsNumber, OddsUnit } from '@/components/OddsNumber';
import { Time } from '@/components/Time';
import { useToast } from '@/components/Toast';
import { ReportImageDialog } from '@/features/media/ReportImageDialog';
import { useIsReported } from '@/features/media/reported';
import { shortAddress } from '@/lib/format';
import { formatSignedPp } from '../format';
import { ShareMenu } from '../ShareMenu';
import { Amount } from '../ui/Amount';
import { MarketStatusBadge } from '../ui/MarketStatusBadge';
import { PracticeBadge } from '../ui/PracticeBadge';
import { TierBadge } from '../ui/TierBadge';
import { BOT_HINT } from './bot-copy';
import { CountdownChip } from './CountdownChip';
import { outcomeLabel, sideLabel } from './market-view';

const menuItem =
  'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm text-foreground outline-none select-none data-[highlighted]:bg-(--hover)';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function MoreMenu({ market }: { market: ApiMarket }) {
  const toast = useToast();
  const mint = market.project.mint;
  const tweet = market.source?.url;
  const image = market.image ?? null;
  const reported = useIsReported(image?.id ?? '');
  const [reporting, setReporting] = useState(false);
  if (!mint && !tweet && !image) return null;

  async function copyMint() {
    if (!mint) return;
    try {
      await navigator.clipboard.writeText(mint);
      toast('Mint address copied');
    } catch {
      toast('Could not copy the address');
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="More actions"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-(--control-border) text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-(--selected) data-[state=open]:bg-(--selected) data-[state=open]:text-foreground [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
            <circle cx="4.5" cy="10" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="15.5" cy="10" r="1.5" />
          </svg>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            data-popover
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="z-(--z-sheet) min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) rounded-lg border border-(--hairline) bg-surface-raised p-1"
          >
            {tweet ? (
              <DropdownMenu.Item asChild className={menuItem}>
                <a href={tweet} target="_blank" rel="noopener noreferrer">
                  View tweet on X<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </DropdownMenu.Item>
            ) : null}
            {mint ? (
              <DropdownMenu.Item className={menuItem} onSelect={() => void copyMint()}>
                Copy token mint
              </DropdownMenu.Item>
            ) : null}
            {image ? (
              <DropdownMenu.Item
                className={`${menuItem} data-[disabled]:cursor-default data-[disabled]:text-muted-foreground`}
                disabled={reported}
                onSelect={() => setReporting(true)}
              >
                {reported ? 'Image reported' : 'Report image'}
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {image ? <ReportImageDialog imageId={image.id} open={reporting} onOpenChange={setReporting} /> : null}
    </>
  );
}

function Price({ market }: { market: ApiMarket }) {
  const final =
    market.status === 'voided' ? 'void' : market.status === 'resolved' ? market.resolution?.finalOutcome : undefined;
  const percent = Math.round(market.probYes * 100);
  const change = market.stats?.change24hPp ?? null;
  const delta = change === null ? 0 : Math.round(change * 10) / 10;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs text-muted-foreground">{final ? 'Final outcome' : `${sideLabel(market, 'yes')} odds`}</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-mono text-3xl leading-none font-semibold tabular-nums">
          {final ? (
            <span data-final-outcome>{outcomeLabel(market, final)}</span>
          ) : (
            <>
              <ChangeTint value={percent} text={String(percent)}>
                <OddsNumber value={percent} />
              </ChangeTint>
              <OddsUnit className="text-[0.55em] text-muted-foreground" />
            </>
          )}
        </p>
        <p
          data-change={change === null ? 'none' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}
          className={`font-mono text-sm font-medium tabular-nums ${delta > 0 ? 'text-(--yes)' : delta < 0 ? 'text-(--no)' : 'text-muted-foreground'}`}
        >
          {change === null ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">no 24 hour change yet</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} </span>
              {formatSignedPp(delta)}
            </>
          )}
          <span className="font-sans font-normal text-muted-foreground"> 24h</span>
        </p>
      </div>
    </div>
  );
}

export function MarketHeader({ market }: { market: ApiMarket }) {
  const { project, stats } = market;
  const dash = '—';
  const bots = stats?.botTrades ?? 0;
  return (
    <header data-market-header className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-3">
        <Monogram name={project.name} size="md" image={market.image} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold text-foreground">{project.name}</span>
            <span className="text-sm font-semibold text-accent-text">${project.ticker}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Created by <span className="font-mono">{shortAddress(market.creator)}</span> ·{' '}
            <Time iso={market.createdAt} format="ago" />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ShareMenu market={market} />
          <MoreMenu market={market} />
        </div>
      </div>

      <h1 className="max-w-[60ch] text-xl leading-tight font-semibold tracking-[-0.015em] text-balance md:text-2xl">
        {market.statement}
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        <CountdownChip market={market} />
        <TierBadge tier={market.tier} variant="pill" collateralSol={market.collateral?.amountSol} />
        <MarketStatusBadge market={market} variant="pill" />
        <PracticeBadge variant="pill" />
      </div>

      <div className="grid gap-4 border-t border-(--hairline) pt-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-8">
        <Price market={market} />
        <div className="flex flex-col gap-2 md:items-end">
          <dl className="grid w-full grid-cols-4 gap-4 md:max-w-sm">
            <Stat label="Volume">
              <Amount value={market.volumePts} format="compact" />
            </Stat>
            <Stat label="Buys">
              <span className="text-(--yes)">{stats ? stats.buys : dash}</span>
            </Stat>
            <Stat label="Sells">
              <span className="text-(--no)">{stats ? stats.sells : dash}</span>
            </Stat>
            <Stat label="Traders">{stats ? stats.humanTraders : market.traders}</Stat>
          </dl>
          {bots > 0 ? (
            <p title={BOT_HINT} className="cursor-help text-xs text-muted-foreground">
              incl. {bots} bot {bots === 1 ? 'trade' : 'trades'}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
