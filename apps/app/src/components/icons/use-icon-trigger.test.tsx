import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPrefs, setPref } from '@/features/settings/prefs';
import { useIconTrigger } from './use-icon-trigger';

function Row() {
  const [active, trigger] = useIconTrigger();
  return (
    <button type="button" {...trigger} data-active={active || undefined}>
      row
    </button>
  );
}

const row = () => screen.getByRole('button', { name: 'row' });

afterEach(() => resetPrefs());

describe('useIconTrigger', () => {
  it('is static at rest and plays while a mouse hovers the row', () => {
    render(<Row />);
    expect(row()).not.toHaveAttribute('data-active');
    fireEvent.pointerEnter(row(), { pointerType: 'mouse' });
    expect(row()).toHaveAttribute('data-active');
    fireEvent.pointerLeave(row(), { pointerType: 'mouse' });
    expect(row()).not.toHaveAttribute('data-active');
  });

  it('ignores touch', () => {
    render(<Row />);
    fireEvent.pointerEnter(row(), { pointerType: 'touch' });
    expect(row()).not.toHaveAttribute('data-active');
  });

  it('never plays when the person chose reduced motion', () => {
    act(() => setPref('motion', 'reduced'));
    render(<Row />);
    fireEvent.pointerEnter(row(), { pointerType: 'mouse' });
    expect(row()).not.toHaveAttribute('data-active');
  });
});
