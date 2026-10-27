import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPrefsToDocument,
  DEFAULT_PREFS,
  getPrefs,
  PREFS_KEY,
  parsePrefs,
  reloadPrefs,
  resetPrefs,
  setPref,
  usePref,
} from './prefs';

beforeEach(() => {
  window.localStorage.clear();
  reloadPrefs();
});
afterEach(() => vi.restoreAllMocks());

describe('feedMotion', () => {
  it('defaults to smooth and accepts calm; anything else falls back', () => {
    expect(DEFAULT_PREFS.feedMotion).toBe('calm');
    expect(parsePrefs({ feedMotion: 'smooth' }).feedMotion).toBe('smooth');
    expect(parsePrefs({ feedMotion: 'wild' }).feedMotion).toBe('calm');
  });
});

describe('parsePrefs', () => {
  it('returns defaults for anything that is not an object', () => {
    for (const raw of [null, undefined, 'x', 3, true]) expect(parsePrefs(raw)).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid fields, replaces invalid ones with their default and drops unknown keys', () => {
    const parsed = parsePrefs({ motion: 'reduced', odds: 'fractional', clock: 12, live: 'off', extra: 1 });
    expect(parsed).toEqual({ ...DEFAULT_PREFS, motion: 'reduced', live: 'off' });
    expect('extra' in parsed).toBe(false);
  });
});

describe('preferences store', () => {
  it('starts with defaults when nothing is stored', () => {
    expect(getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('persists a change under the versioned key and survives a reload', () => {
    setPref('odds', 'decimal');
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}')).toMatchObject({ odds: 'decimal' });
    reloadPrefs();
    expect(getPrefs().odds).toBe('decimal');
  });

  it('falls back to defaults on bad JSON instead of throwing', () => {
    window.localStorage.setItem(PREFS_KEY, '{not json');
    expect(() => reloadPrefs()).not.toThrow();
    expect(getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('still applies a change for this tab when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setPref('clock', '12h')).not.toThrow();
    expect(getPrefs().clock).toBe('12h');
  });

  it('syncs from another tab through the storage event', () => {
    const { result } = renderHook(() => usePref('density'));
    expect(result.current).toBe('compact');
    act(() => {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, density: 'comfortable' }));
      window.dispatchEvent(new StorageEvent('storage', { key: PREFS_KEY }));
    });
    expect(result.current).toBe('comfortable');
  });

  it('hands out a stable snapshot until something changes', () => {
    const a = getPrefs();
    setPref('motion', 'system');
    expect(getPrefs()).toBe(a);
  });

  it('resetPrefs restores defaults and clears storage', () => {
    setPref('live', 'off');
    resetPrefs();
    expect(getPrefs()).toEqual(DEFAULT_PREFS);
    expect(window.localStorage.getItem(PREFS_KEY)).toBeNull();
  });

  it('mirrors motion and density onto <html> for the stylesheet', () => {
    const root = document.documentElement;
    setPref('motion', 'reduced');
    setPref('density', 'comfortable');
    expect(root).toHaveAttribute('data-motion', 'reduced');
    expect(root).not.toHaveAttribute('data-density');
    setPref('density', 'compact');
    expect(root).toHaveAttribute('data-density', 'compact');
    applyPrefsToDocument({ ...DEFAULT_PREFS, density: 'comfortable' });
    expect(root).not.toHaveAttribute('data-motion');
    expect(root).not.toHaveAttribute('data-density');
  });
});
