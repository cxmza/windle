import type { MarketTier } from '@windle/shared';
import { formatSolUnit } from '../format';
import { pill } from './styles';

const TEXT: Record<MarketTier, { label: string; hint: string; tone: string }> = {
  community: {
    label: 'Community',
    hint: 'Started from a tweet by anyone. The team has not put collateral behind it.',
    tone: 'border-(--hairline) text-muted-foreground',
  },
  backed: {
    label: 'Backed',
    hint: 'The team locked SOL collateral behind this promise.',
    tone: 'border-(--hairline) text-accent-text',
  },
};

type Props = {
  tier: MarketTier;
  /** `tag` is the compact list badge; `pill` is the market header chip, which also shows the collateral. */
  variant?: 'tag' | 'pill';
  collateralSol?: number | undefined;
};

export function TierBadge({ tier, variant = 'tag', collateralSol }: Props) {
  const t = TEXT[tier];
  if (variant === 'pill') {
    return (
      <span className={`${pill} border-(--hairline) text-foreground`}>
        {tier === 'backed' && collateralSol !== undefined
          ? `${t.label} · ${formatSolUnit(collateralSol)}`
          : 'Community'}
      </span>
    );
  }
  return (
    <span
      title={t.hint}
      className={`inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-xs font-medium tracking-[0.04em] uppercase ${t.tone}`}
    >
      {t.label}
    </span>
  );
}
