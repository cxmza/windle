import { type Market, type MarketStatus, SIDE_LABELS } from '@windle/shared';
import { pill } from './styles';

type Shape = Pick<Market, 'status' | 'tier' | 'resolution'>;

const tag =
  'inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-xs font-medium tracking-[0.04em] whitespace-nowrap uppercase';

const FLAT = 'border-(--hairline) text-muted-foreground';
const YES = 'border-transparent bg-yes-soft text-(--yes)';
const NO = 'border-transparent bg-no-soft text-(--no)';

const TONE: Record<MarketStatus, string> = {
  open: YES,
  closed: FLAT,
  proposed: 'border-(--hairline) text-foreground',
  disputed: NO,
  resolved: 'border-(--hairline) text-foreground',
  voided: FLAT,
};

const WORDS: Record<MarketStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  proposed: 'Outcome proposed',
  disputed: 'Disputed',
  resolved: 'Resolved',
  voided: 'Voided',
};

export function statusText(m: Shape): string {
  const final = m.resolution?.finalOutcome;
  if (m.status === 'resolved' && (final === 'yes' || final === 'no')) return `Resolved: ${SIDE_LABELS[m.tier][final]}`;
  return WORDS[m.status];
}

function tone(m: Shape): string {
  const final = m.resolution?.finalOutcome;
  if (m.status === 'resolved' && final === 'yes') return YES;
  if (m.status === 'resolved' && final === 'no') return NO;
  return TONE[m.status];
}

function pillLabel(m: Shape): string {
  const final = m.resolution?.finalOutcome;
  switch (m.status) {
    case 'open':
      return 'Open';
    case 'closed':
      return m.tier === 'backed' ? 'Closed · checking chain' : 'Closed · awaiting resolution';
    case 'proposed':
      return 'Proposed · dispute window';
    case 'disputed':
      return 'Disputed';
    case 'resolved':
      return final === 'yes' || final === 'no' ? `Resolved · ${SIDE_LABELS[m.tier][final]}` : 'Resolved';
    case 'voided':
      return 'Voided';
  }
}

type Props = {
  market: Shape;
  /** `tag` is the short list badge; `pill` is the market header status with the next step spelled out. */
  variant?: 'tag' | 'pill';
};

export function MarketStatusBadge({ market, variant = 'tag' }: Props) {
  if (variant === 'pill') {
    return (
      <span data-status={market.status} className={`${pill} ${tone(market)}`}>
        {market.status === 'open' ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
        {pillLabel(market)}
      </span>
    );
  }
  return <span className={`${tag} ${tone(market)}`}>{statusText(market)}</span>;
}
