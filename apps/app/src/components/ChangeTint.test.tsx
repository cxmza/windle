import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangeTint } from './ChangeTint';

const tint = (root: HTMLElement) => root.firstElementChild as HTMLElement;

describe('ChangeTint', () => {
  it('stays quiet on mount, then flashes toward each change and alternates the tick to restart', () => {
    const { container, rerender } = render(
      <ChangeTint value={42} text="42">
        42
      </ChangeTint>,
    );
    expect(tint(container)).not.toHaveAttribute('data-tint');
    expect(tint(container)).not.toHaveAttribute('data-tick');

    rerender(
      <ChangeTint value={45} text="45">
        45
      </ChangeTint>,
    );
    expect(tint(container)).toHaveAttribute('data-tint', 'up');
    const first = tint(container).getAttribute('data-tick');

    rerender(
      <ChangeTint value={40} text="40">
        40
      </ChangeTint>,
    );
    expect(tint(container)).toHaveAttribute('data-tint', 'down');
    expect(tint(container).getAttribute('data-tick')).not.toBe(first);
  });

  it('does not flash when only the hidden value moves and the shown text stays', () => {
    const { container, rerender } = render(
      <ChangeTint value={42.1} text="42">
        42
      </ChangeTint>,
    );
    rerender(
      <ChangeTint value={42.3} text="42">
        42
      </ChangeTint>,
    );
    expect(tint(container)).not.toHaveAttribute('data-tint');
    expect(tint(container)).not.toHaveAttribute('data-tick');
  });
});
