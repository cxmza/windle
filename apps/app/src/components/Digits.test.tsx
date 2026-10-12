import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Digits } from './Digits';

const fresh = (root: HTMLElement) => [...root.querySelectorAll('[data-new]')].map((n) => n.textContent).join('');

describe('Digits', () => {
  it('animates nothing on first render, then only the digits that changed, in the direction of the change', () => {
    const { container, rerender } = render(<Digits text="72" />);
    expect(fresh(container)).toBe('');
    rerender(<Digits text="74" />);
    expect(fresh(container)).toBe('4');
    expect(container.querySelector('[data-digits]')).toHaveAttribute('data-dir', 'up');
    rerender(<Digits text="69" />);
    expect(fresh(container)).toBe('69');
    expect(container.querySelector('[data-digits]')).toHaveAttribute('data-dir', 'down');
    expect(container.textContent).toBe('69');
  });
});
