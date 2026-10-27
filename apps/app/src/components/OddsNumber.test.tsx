import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPrefs, setPref } from '@/features/settings/prefs';
import { OddsNumber, OddsUnit } from './OddsNumber';

afterEach(() => resetPrefs());

function Odds({ value }: { value: number }) {
  return (
    <p>
      <OddsNumber value={value} />
      <OddsUnit />
    </p>
  );
}

describe('OddsNumber', () => {
  it('shows percent by default and switches to decimal odds when the preference changes', () => {
    const { container } = render(<Odds value={62} />);
    expect(container.textContent).toBe('62%');
    act(() => setPref('odds', 'decimal'));
    expect(container.textContent).toBe('1.61');
    act(() => setPref('odds', 'percent'));
    expect(container.textContent).toBe('62%');
  });

  it('does not roll digits when only the format changes', () => {
    const { container } = render(<Odds value={64} />);
    act(() => setPref('odds', 'decimal'));
    expect(container.querySelectorAll('[data-digit][data-new]')).toHaveLength(0);
  });
});
