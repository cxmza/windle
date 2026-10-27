import { type ApiMarket, type DurationPreset, type DurationRisk, durationPresetOf } from '@windle/shared';

export type RiskTone = DurationRisk | 'custom';

export const RISK_LABEL: Record<DurationRisk, string> = {
  extreme: 'Extreme risk',
  high: 'High risk',
  medium: 'Medium risk',
  standard: 'Standard',
  low: 'Low risk',
};

/** Text, border and wash per risk: hot for the short markets, quiet for the long ones. */
export const RISK_CLASS: Record<RiskTone, { text: string; border: string; wash: string }> = {
  extreme: { text: 'text-risk-extreme', border: 'border-risk-extreme/60', wash: 'bg-risk-extreme/10' },
  high: { text: 'text-risk-high', border: 'border-risk-high/60', wash: 'bg-risk-high/10' },
  medium: { text: 'text-risk-medium', border: 'border-risk-medium/60', wash: 'bg-risk-medium/10' },
  standard: { text: 'text-accent-text', border: 'border-border-accent/60', wash: 'bg-accent/10' },
  low: { text: 'text-muted-foreground', border: 'border-(--hairline)', wash: 'bg-muted/40' },
  custom: { text: 'text-muted-foreground', border: 'border-(--hairline)', wash: 'bg-muted/40' },
};

export function presetOfMarket(market: Pick<ApiMarket, 'durationPreset'>): DurationPreset | null {
  return market.durationPreset ? durationPresetOf(market.durationPreset) : null;
}
