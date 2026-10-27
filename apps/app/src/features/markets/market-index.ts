import type { MARKET_LIST_SORTS, MarketListQuery, MarketTier } from '@windle/shared';

export type MarketSort = (typeof MARKET_LIST_SORTS)[number];

export const TIER_TABS = ['all', 'community', 'backed'] as const;
export type TierTab = (typeof TIER_TABS)[number];

export const STATUS_GROUPS = ['open', 'resolving', 'resolved'] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const GROUP_QUERY: Record<StatusGroup, NonNullable<MarketListQuery['status']>> = {
  open: 'open',
  resolving: 'closed',
  resolved: 'settled',
};

export const GROUP_LABELS: Record<StatusGroup, string> = { open: 'Open', resolving: 'Resolving', resolved: 'Resolved' };

export const SORT_OPTIONS: readonly { value: MarketSort; label: string }[] = [
  { value: 'closing', label: 'Ending soon' },
  { value: 'volume', label: 'Volume' },
  { value: 'new', label: 'Newest' },
  { value: 'traders', label: 'Most traders' },
];

export const defaultSort = (group: StatusGroup): MarketSort => (group === 'resolved' ? 'new' : 'closing');

export function parseTier(raw: string | null): TierTab {
  return TIER_TABS.find((t) => t === raw) ?? 'all';
}

export function parseGroup(raw: string | null): StatusGroup {
  return STATUS_GROUPS.find((g) => g === raw) ?? 'open';
}

export function parseSort(raw: string | null, group: StatusGroup): MarketSort {
  return SORT_OPTIONS.find((o) => o.value === raw)?.value ?? defaultSort(group);
}

export const tierOf = (tab: TierTab): MarketTier | undefined => (tab === 'all' ? undefined : tab);

export function matchesQuery(
  m: {
    statement: string;
    project: { name: string; ticker: string };
    source?: { author: { handle: string } } | undefined;
  },
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [m.statement, m.project.name, m.project.ticker, m.source?.author.handle ?? ''].some((s) =>
    s.toLowerCase().includes(needle),
  );
}
