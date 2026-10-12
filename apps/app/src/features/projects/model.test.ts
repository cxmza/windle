import { describe, expect, it } from 'vitest';
import { createFixtureProjects } from './fixtures';
import { parseSort, parseStatuses, projectSlug, selectProjects, slugify, trackRecord } from './model';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const projects = createFixtureProjects(NOW);

describe('fixtures', () => {
  it('has 12 projects with unique slugs, history and activity', () => {
    expect(projects).toHaveLength(12);
    expect(new Set(projects.map((p) => p.slug)).size).toBe(12);
    for (const p of projects) {
      expect(p.history.length).toBeGreaterThanOrEqual(1);
      expect(p.history.length).toBeLessThanOrEqual(4);
      expect(p.activity.length).toBeGreaterThan(0);
      expect(p.slug).toBe(projectSlug(p.current));
    }
  });

  it('keeps history and activity newest first', () => {
    for (const p of projects) {
      const h = p.history.map((x) => Date.parse(x.settledAt));
      expect(h).toEqual([...h].sort((a, b) => b - a));
      const a = p.activity.map((x) => Date.parse(x.at));
      expect(a).toEqual([...a].sort((a, b) => b - a));
    }
  });
});

describe('model', () => {
  it('slugifies team names', () => {
    expect(slugify('Fennel DAO')).toBe('fennel-dao');
    expect(slugify('  Pale   Ember! ')).toBe('pale-ember');
  });

  it('counts the resolved current promise in the track record', () => {
    const moss = projects.find((p) => p.slug === 'mossgrove');
    const kestrel = projects.find((p) => p.slug === 'kestrel-protocol');
    expect(moss && trackRecord(moss)).toEqual({ shipped: 3, slashed: 0 });
    expect(kestrel && trackRecord(kestrel)).toEqual({ shipped: 2, slashed: 1 });
  });

  it('filters by query over name, ticker and promise, and by status', () => {
    expect(selectProjects(projects, { q: 'kstl', statuses: [] }, 'ending').map((p) => p.slug)).toEqual([
      'kestrel-protocol',
    ]);
    expect(selectProjects(projects, { q: 'multisig', statuses: [] }, 'ending')[0]?.slug).toBe('quiet-harbor');
    const settled = selectProjects(projects, { q: '', statuses: ['shipped', 'slashed'] }, 'ending');
    expect(settled.map((p) => p.current.status).sort()).toEqual(['shipped', 'slashed']);
    expect(selectProjects(projects, { q: 'zzz', statuses: [] }, 'ending')).toEqual([]);
  });

  it('sorts: ending soon puts open promises first by deadline', () => {
    const list = selectProjects(projects, { q: '', statuses: [] }, 'ending');
    expect(list[0]?.slug).toBe('glasswing');
    expect(list[1]?.slug).toBe('kestrel-protocol');
    expect(list.at(-1)?.current.status).not.toBe('live');
  });

  it('sorts by collateral and by record', () => {
    const byCollateral = selectProjects(projects, { q: '', statuses: [] }, 'collateral');
    expect(byCollateral[0]?.slug).toBe('northline');
    const byRecord = selectProjects(projects, { q: '', statuses: [] }, 'record');
    expect(byRecord[0]?.slug).toBe('mossgrove');
  });

  it('parses url params defensively', () => {
    expect(parseSort('nope')).toBe('ending');
    expect(parseSort('record')).toBe('record');
    expect(parseStatuses('live,bogus,slashed')).toEqual(['live', 'slashed']);
    expect(parseStatuses(null)).toEqual([]);
  });
});
