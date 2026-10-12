import { isOpen, type Market, type MarketStatus } from '../markets/types';
import { type Project, type ProjectFilters, type ProjectSort, SORTS, STATUSES, type TrackRecord } from './types';

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const projectSlug = (market: Pick<Market, 'team'>): string => slugify(market.team);

export const projectPath = (slug: string): string => `/projects/${slug}`;

export function trackRecord(p: Project): TrackRecord {
  const record: TrackRecord = { shipped: 0, slashed: 0 };
  for (const h of p.history) record[h.outcome === 'shipped' ? 'shipped' : 'slashed'] += 1;
  if (p.current.status === 'shipped') record.shipped += 1;
  if (p.current.status === 'slashed') record.slashed += 1;
  return record;
}

const rate = (r: TrackRecord): number => (r.shipped + r.slashed === 0 ? 0 : r.shipped / (r.shipped + r.slashed));

export function matches(p: Project, { q, statuses }: ProjectFilters): boolean {
  if (statuses.length > 0 && !statuses.includes(p.current.status)) return false;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [p.name, p.ticker, p.current.promise].some((s) => s.toLowerCase().includes(needle));
}

const deadline = (p: Project): number => Date.parse(p.current.deadline);

export function compareProjects(sort: ProjectSort): (a: Project, b: Project) => number {
  switch (sort) {
    case 'collateral':
      return (a, b) => b.current.collateralSol - a.current.collateralSol || deadline(a) - deadline(b);
    case 'record':
      return (a, b) => {
        const ra = trackRecord(a);
        const rb = trackRecord(b);
        return rate(rb) - rate(ra) || rb.shipped - ra.shipped || deadline(a) - deadline(b);
      };
    default:
      return (a, b) => {
        const oa = isOpen(a.current);
        const ob = isOpen(b.current);
        if (oa !== ob) return oa ? -1 : 1;
        return oa ? deadline(a) - deadline(b) : deadline(b) - deadline(a);
      };
  }
}

export function selectProjects(projects: readonly Project[], filters: ProjectFilters, sort: ProjectSort): Project[] {
  return projects.filter((p) => matches(p, filters)).sort(compareProjects(sort));
}

export const parseSort = (raw: string | null): ProjectSort => SORTS.find((s) => s.value === raw)?.value ?? 'ending';

export function parseStatuses(raw: string | null): MarketStatus[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(','));
  return STATUSES.filter((s) => wanted.has(s));
}

export const serializeStatuses = (statuses: readonly MarketStatus[]): string => statuses.join(',');
