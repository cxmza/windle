import { describe, expect, it } from 'vitest';
import { defaultSort, GROUP_QUERY, matchesQuery, parseGroup, parseSort, parseTier, tierOf } from './market-index';

describe('market index params', () => {
  it('falls back to all / open / the status default sort for unknown values', () => {
    expect(parseTier('nope')).toBe('all');
    expect(parseTier(null)).toBe('all');
    expect(parseGroup('x')).toBe('open');
    expect(parseSort(null, 'open')).toBe('closing');
    expect(parseSort('bogus', 'resolved')).toBe('new');
    expect(parseSort('volume', 'resolved')).toBe('volume');
    expect(defaultSort('resolving')).toBe('closing');
  });

  it('maps the tab to a tier filter and the groups to the api status filters', () => {
    expect(tierOf('all')).toBeUndefined();
    expect(tierOf('backed')).toBe('backed');
    expect(GROUP_QUERY).toEqual({ open: 'open', resolving: 'closed', resolved: 'settled' });
  });

  it('searches statement, project, ticker and author handle', () => {
    const m = {
      statement: 'Sprout ships staking v2',
      project: { name: 'Sprout', ticker: 'SPRT' },
      source: { author: { handle: 'sproutfi_dev' } },
    };
    expect(matchesQuery(m, '')).toBe(true);
    expect(matchesQuery(m, ' STAKING ')).toBe(true);
    expect(matchesQuery(m, 'sprt')).toBe(true);
    expect(matchesQuery(m, 'sproutfi')).toBe(true);
    expect(matchesQuery(m, 'moonpaw')).toBe(false);
  });
});
