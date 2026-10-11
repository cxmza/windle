import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Countdown, describeRemaining, EXAMPLE_REMAINING_MS, splitRemaining } from './Countdown';

describe('splitRemaining', () => {
  it('splits the example deadline into 3d 04:12:09', () => {
    expect(splitRemaining(EXAMPLE_REMAINING_MS)).toEqual({ days: 3, hours: 4, minutes: 12, seconds: 9 });
  });
  it('clamps at zero', () => {
    expect(splitRemaining(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('describeRemaining', () => {
  it('pluralises and omits seconds', () => {
    expect(describeRemaining({ days: 1, hours: 2, minutes: 1, seconds: 30 })).toBe(
      '1 day, 2 hours, 1 minute until the deadline.',
    );
  });
  it('says so when the deadline is reached', () => {
    expect(describeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe('Deadline reached.');
  });
});

describe('Countdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const digits = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-countdown-digit]')].map((d) => d.textContent).join('');

  it('starts at 3d 04:12:09 and ticks each second', () => {
    const { container } = render(<Countdown />);
    expect(digits(container)).toBe('3041209');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(digits(container)).toBe('3041208');
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(digits(container)).toBe('3041159');
  });

  it('leaves the polite live region untouched between minute changes and updates it on the minute', () => {
    render(<Countdown remainingMs={125_000} />); // 2:05
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('0 days, 0 hours, 2 minutes');
    const textNode = status.firstChild;
    act(() => {
      vi.advanceTimersByTime(5000); // 2:00, still 2 minutes
    });
    expect(status.firstChild).toBe(textNode);
    act(() => {
      vi.advanceTimersByTime(1000); // 1:59
    });
    expect(status).toHaveTextContent('1 minute');
  });

  it('stops at zero and announces it', () => {
    render(<Countdown remainingMs={2000} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Deadline reached.');
  });

  it('keeps the visual digits out of the accessibility tree', () => {
    const { container } = render(<Countdown />);
    expect(container.querySelector('time')).toHaveAttribute('aria-hidden', 'true');
  });
  it('can be paused and resumed (WCAG 2.2.2), resuming at the real time left', () => {
    const { container } = render(<Countdown />);
    const toggle = screen.getByRole('button', { name: 'Pause timer' });
    act(() => {
      toggle.click();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(digits(container)).toBe('3041209');
    act(() => {
      screen.getByRole('button', { name: 'Resume timer' }).click();
    });
    expect(digits(container)).toBe('3041206');
  });
});
