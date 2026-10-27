import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Coin } from '@/components/Coin';
import { formatPtsUnit } from '../format';
import { Amount } from './Amount';

describe('Coin', () => {
  it('names the unit for assistive tech and never shows the abbreviation', () => {
    const { container } = render(<Coin />);
    expect(screen.getByRole('img', { name: 'practice points' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/pts/i);
  });

  it('hides itself when the number beside it already names the unit', () => {
    render(<Coin decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('[data-coin]')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Amount', () => {
  it('renders the number followed by the coin', () => {
    const { container } = render(<Amount value={1234.5} />);
    expect(container.querySelector('[data-amount]')).toHaveTextContent('1,234.5');
    expect(screen.getByRole('img', { name: 'practice points' })).toBeInTheDocument();
  });

  it('formats whole, compact, signed and price values', () => {
    const { container } = render(
      <>
        <Amount value={1234.56} format="whole" />
        <Amount value={12_500} format="compact" />
        <Amount value={-3.5} format="signed" />
        <Amount value={0.4} format="price" />
      </>,
    );
    const texts = [...container.querySelectorAll('[data-amount]')].map((n) => n.textContent?.trim());
    expect(texts).toEqual(['1,235', '12.5K', '−3.5', '0.40']);
  });

  it('puts the per-share suffix after the coin', () => {
    const { container } = render(<Amount value={0.55} format="price" per="/share" />);
    expect(container.querySelector('[data-amount]')).toHaveTextContent('0.55 /share');
  });

  it('rolls digits when asked', () => {
    const { container } = render(<Amount value={950} roll />);
    expect(container.querySelector('[data-digits]')).toHaveTextContent('950');
  });
});

describe('coin motion', () => {
  const coin = () => document.querySelector('[data-coin]');

  it('stays still on first render, so a list of balances does not pulse on mount', () => {
    render(<Amount value={100} coin="pulse" />);
    expect(coin()).not.toHaveAttribute('data-beat');
    expect(coin()).not.toHaveAttribute('data-tick');
  });

  it('beats when the balance changes, alternating the tick so back-to-back changes restart it', () => {
    const { rerender } = render(<Amount value={100} coin="settle" />);
    rerender(<Amount value={90} coin="settle" />);
    expect(coin()).toHaveAttribute('data-beat', 'settle');
    expect(coin()).toHaveAttribute('data-tick', 'a');
    rerender(<Amount value={80} coin="settle" />);
    expect(coin()).toHaveAttribute('data-tick', 'b');
    rerender(<Amount value={80} coin="settle" />);
    expect(coin()).toHaveAttribute('data-tick', 'b');
  });

  it('never beats a plain amount', () => {
    const { rerender } = render(<Amount value={100} />);
    rerender(<Amount value={90} />);
    expect(coin()).not.toHaveAttribute('data-tick');
    expect(coin()).not.toHaveAttribute('data-flip');
  });

  it('marks a payout coin to flip', () => {
    render(<Amount value={30} coin="flip" />);
    expect(coin()).toHaveAttribute('data-flip', 'true');
  });
});

describe('plain-text unit', () => {
  it('spells the unit out for contexts that cannot hold the icon', () => {
    expect(formatPtsUnit(50)).toBe('50 practice points');
    expect(formatPtsUnit(50)).not.toMatch(/pts/);
  });
});
