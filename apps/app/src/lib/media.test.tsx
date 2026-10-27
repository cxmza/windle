import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPrefs, setPref } from '@/features/settings/prefs';
import { useReducedMotion } from './media';

const original = window.matchMedia;

function stubSystemReduced(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = original;
  resetPrefs();
});

describe('useReducedMotion', () => {
  it('is false when neither the system nor the preference asks for it', () => {
    stubSystemReduced(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('follows the system setting', () => {
    stubSystemReduced(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it('honours the Reduced preference and updates live', () => {
    stubSystemReduced(false);
    const { result } = renderHook(() => useReducedMotion());
    act(() => setPref('motion', 'reduced'));
    expect(result.current).toBe(true);
    act(() => setPref('motion', 'system'));
    expect(result.current).toBe(false);
  });
});
