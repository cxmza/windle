import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFS_KEY, reloadPrefs } from '@/features/settings/prefs';
import { observeServerTime, resetServerTime } from '@/lib/server-time';
import { Time } from './Time';

const REAL = '2026-10-13T12:00:00.000Z';
const REAL_MS = Date.parse(REAL);

beforeEach(() => {
  vi.useFakeTimers();
  resetServerTime();
  localStorage.clear();
  reloadPrefs();
});
afterEach(() => {
  vi.useRealTimers();
  resetServerTime();
  localStorage.clear();
  reloadPrefs();
});

describe('Time', () => {
  it('is wrong by the clock skew until the server time is known, and right after', () => {
    vi.setSystemTime(REAL_MS - 40_000);
    const created = new Date(REAL_MS - 12_000).toISOString();
    render(<Time iso={created} />);
    expect(screen.getByText('now')).toBeInTheDocument();
    act(() => observeServerTime(REAL_MS, REAL_MS - 40_000, REAL_MS - 40_000, 0));
    expect(screen.getByText('12s')).toBeInTheDocument();
  });

  it('ticks on the shared clock', () => {
    vi.setSystemTime(REAL_MS);
    render(<Time iso={new Date(REAL_MS - 20_000).toISOString()} />);
    expect(screen.getByText('20s')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByText('23s')).toBeInTheDocument();
  });

  it('carries the exact time in the tooltip and dateTime, in the chosen 12 or 24-hour style', () => {
    vi.setSystemTime(REAL_MS);
    const iso = '2026-10-10T14:05:09.000Z';
    const { unmount } = render(<Time iso={iso} />);
    const el = screen.getByText('Oct 10');
    expect(el.tagName).toBe('TIME');
    expect(el).toHaveAttribute('datetime', iso);
    expect(el.getAttribute('title')).toMatch(/^\d{2}:05:09 · Oct 10, 2026$/);
    unmount();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ clock: '12h' }));
    reloadPrefs();
    render(<Time iso={iso} />);
    expect(screen.getByText('Oct 10').getAttribute('title')).toMatch(/^\d{2}:05:09 [AP]M · Oct 10, 2026$/);
  });

  it('writes "ago" when asked', () => {
    vi.setSystemTime(REAL_MS);
    render(<Time iso={new Date(REAL_MS - 4 * 60_000).toISOString()} format="ago" />);
    expect(screen.getByText('4m ago')).toBeInTheDocument();
  });
});
