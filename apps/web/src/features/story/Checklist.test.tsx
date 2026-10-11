import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checklist } from './Checklist';

describe('Checklist', () => {
  it('lists the three onchain checks with their resolved example state as text', () => {
    render(<Checklist />);
    const list = screen.getByRole('list', { name: 'Onchain checks' });
    expect(list).toHaveAttribute('data-resolved', '3');
    const items = screen.getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-state'))).toEqual(['pass', 'pass', 'fail']);
    expect(items[0]).toHaveTextContent('Program deployed: passed');
    expect(items[2]).toHaveTextContent('Revenue ≥ N: failed');
  });

  it('follows the states prop (pending until resolved) and keeps stable hooks', () => {
    const { container } = render(<Checklist states={{ deployed: 'pending', vesting: 'pending', revenue: 'pass' }} />);
    expect(container.querySelector('[data-checklist]')).toHaveAttribute('data-resolved', '1');
    const items = container.querySelectorAll('[data-checklist-item]');
    expect([...items].map((i) => i.getAttribute('data-state'))).toEqual(['pending', 'pending', 'pass']);
    for (const item of items) expect(item.querySelectorAll('[data-stroke]').length).toBeGreaterThanOrEqual(4);
  });
});
