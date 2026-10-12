import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroKicker } from './HeroKicker';

describe('HeroKicker', () => {
  it('reads as plain text and draws the Solana mark right before its word', () => {
    const { container } = render(<HeroKicker text="windle · Solana protocol" />);
    const label = container.querySelector('p');
    expect(label?.querySelector('.sr-only')?.textContent).toBe('windle · Solana protocol');
    const split = label?.querySelector('[data-kicker-split]');
    expect(split?.getAttribute('aria-hidden')).toBe('true');
    expect(split?.textContent).toBe('windle · Solana protocol');
    const mark = split?.querySelector('[data-solana-mark]');
    expect(mark?.querySelectorAll('[data-solana-bar]')).toHaveLength(3);
    expect(mark?.nextElementSibling?.textContent).toBe('S');
  });

  it('staggers chars and the mark as one sequence', () => {
    const { container } = render(<HeroKicker text="windle · Solana protocol" />);
    const slots = [...container.querySelectorAll<HTMLElement>('[data-kicker-char], [data-solana-mark]')].map((el) =>
      Number(el.style.getPropertyValue('--i')),
    );
    expect(slots).toEqual(slots.map((_, i) => i));
  });
});
