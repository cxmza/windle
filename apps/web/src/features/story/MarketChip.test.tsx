import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reset } from './demo-market';
import { MarketChip } from './MarketChip';

describe('MarketChip (interactive demo)', () => {
  beforeEach(() => reset());

  it('is clearly labelled as a demo', () => {
    render(<MarketChip />);
    expect(screen.getByText(/Demo — no real funds/)).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveValue(72);
  });

  it('moves the price and shows the position when buying, and resets', async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketChip />);
    const resetButton = screen.getByRole('button', { name: 'Reset' });
    expect(resetButton).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Buy YES' }));
    const afterYes = Number(screen.getByRole('meter').getAttribute('value'));
    expect(afterYes).toBeGreaterThan(72);
    expect(container.querySelector('[data-price="yes"]')).toHaveTextContent(`${afterYes}¢`);
    expect(screen.getByRole('status')).toHaveTextContent('Bought 10.00 USDC of YES');
    expect(container.querySelector('[data-position]')).toHaveTextContent(
      /You hold [\d.,]+ YES, 0\.00 NO\. Spent 10\.00/,
    );
    expect(resetButton).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Buy NO' }));
    await user.click(screen.getByRole('button', { name: 'Buy NO' }));
    expect(Number(screen.getByRole('meter').getAttribute('value'))).toBeLessThan(afterYes);

    await user.click(resetButton);
    expect(screen.getByRole('meter')).toHaveValue(72);
    expect(container.querySelector('[data-price="yes"]')).toHaveTextContent('72¢');
    expect(container.querySelector('[data-position]')).toHaveTextContent('No position yet');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  describe('trade pulse', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      // jsdom has no Element.animate; drop the stub
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    });

    it('confirms Buy YES and Buy NO alike, each on its own button', async () => {
      const calls: Element[] = [];
      const animate = vi.fn(function (this: Element) {
        calls.push(this);
        return { cancel: vi.fn() } as unknown as Animation;
      });
      Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true, writable: true });
      const user = userEvent.setup();
      render(<MarketChip />);
      await user.click(screen.getByRole('button', { name: 'Buy YES' }));
      await user.click(screen.getByRole('button', { name: 'Buy NO' }));
      expect(calls.map((el) => el.getAttribute('data-trade-glow'))).toEqual(['yes', 'no']);
    });
  });
});
