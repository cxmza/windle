import type { Market, MarketStatus } from '../markets/types';

export type Outcome = 'shipped' | 'slashed';

export interface PastPromise {
  id: string;
  statement: string;
  outcome: Outcome;
  settledAt: string;
  collateralSol: number;
}

export type ActivityKind = 'trade' | 'promise' | 'settlement';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  text: string;
  at: string;
  amountSol?: number;
}

export interface Project {
  slug: string;
  name: string;
  ticker: string;
  summary: string;
  current: Market;
  history: readonly PastPromise[];
  activity: readonly ActivityEvent[];
}

export interface TrackRecord {
  shipped: number;
  slashed: number;
}

export type ProjectSort = 'ending' | 'collateral' | 'record';

export const STATUSES = ['live', 'settling', 'shipped', 'slashed'] as const satisfies readonly MarketStatus[];

export const SORTS: readonly { value: ProjectSort; label: string }[] = [
  { value: 'ending', label: 'Ending soon' },
  { value: 'collateral', label: 'Most collateral' },
  { value: 'record', label: 'Best record' },
];

export interface ProjectFilters {
  q: string;
  statuses: readonly MarketStatus[];
}
