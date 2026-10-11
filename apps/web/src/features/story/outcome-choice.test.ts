import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearChoice, getSnapshot, setChoice, subscribe } from './outcome-choice';

describe('outcome choice store', () => {
  beforeEach(() => clearChoice());

  it('defaults to null (follow scroll)', () => {
    expect(getSnapshot()).toBeNull();
  });

  it('stores a choice and notifies once per real change', () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    setChoice('ship');
    setChoice('ship');
    expect(getSnapshot()).toBe('ship');
    expect(listener).toHaveBeenCalledTimes(1);
    setChoice('slash');
    expect(listener).toHaveBeenCalledTimes(2);
    clearChoice();
    expect(getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    setChoice('ship');
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
