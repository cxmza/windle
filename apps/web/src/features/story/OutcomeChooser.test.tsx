import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { OutcomeChooser } from './OutcomeChooser';
import { clearChoice, getSnapshot } from './outcome-choice';

describe('OutcomeChooser', () => {
  beforeEach(() => clearChoice());

  it('is a labelled radio group with nothing selected by default (follow scroll)', () => {
    render(<OutcomeChooser />);
    expect(screen.getByRole('radiogroup', { name: 'Pick an ending' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SHIP' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'SLASH' })).not.toBeChecked();
    expect(getSnapshot()).toBeNull();
    expect(screen.getByRole('button', { name: 'Follow scroll' })).toBeDisabled();
  });

  it('chooses with a click, shows the destination, and publishes to the store', async () => {
    const user = userEvent.setup();
    render(<OutcomeChooser />);
    await user.click(screen.getByRole('radio', { name: 'SLASH' }));
    expect(getSnapshot()).toBe('slash');
    expect(screen.getByRole('radio', { name: 'SLASH' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('SLASH: 50,000 USDC slashed to NO holders');
    // the struck-out alternative is decorative (aria-hidden) and not part of the accessible text
    expect(screen.getByRole('status').querySelector('[data-destination="ship"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('is keyboard operable: Tab to the group, arrows move and select', async () => {
    const user = userEvent.setup();
    render(<OutcomeChooser />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'SHIP' })).toHaveFocus();
    // Radix moves focus on the next tick and selects it only while the arrow is still held, so hold the key
    // (a real keypress lasts milliseconds; user-event's instant down+up would race the timer)
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(getSnapshot()).toBe('slash'));
    await user.keyboard('{/ArrowRight}');
    expect(screen.getByRole('radio', { name: 'SLASH' })).toHaveFocus();
    await user.keyboard('{ArrowLeft>}');
    await waitFor(() => expect(getSnapshot()).toBe('ship'));
    await user.keyboard('{/ArrowLeft}');
  });

  it('returns to following the scroll', async () => {
    const user = userEvent.setup();
    render(<OutcomeChooser />);
    await user.click(screen.getByRole('radio', { name: 'SHIP' }));
    await user.click(screen.getByRole('button', { name: 'Follow scroll' }));
    expect(getSnapshot()).toBeNull();
    expect(screen.getByRole('radio', { name: 'SHIP' })).not.toBeChecked();
  });
});
