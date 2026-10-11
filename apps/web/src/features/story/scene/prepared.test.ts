import { describe, expect, it, vi } from 'vitest';
import { preparable } from './prepared';

describe('preparable', () => {
  it('hands out the prepared value once, then builds on demand', () => {
    const build = vi.fn(() => ({ id: Math.random() }));
    const p = preparable(build, () => {});
    p.prepare();
    p.prepare(); // idempotent
    expect(build).toHaveBeenCalledTimes(1);
    const first = p.take();
    expect(build).toHaveBeenCalledTimes(1);
    const second = p.take();
    expect(build).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('disposes a prepared value that is dropped, and nothing that was taken', () => {
    const dispose = vi.fn();
    const p = preparable(() => 'geometry', dispose);
    p.prepare();
    p.drop();
    expect(dispose).toHaveBeenCalledWith('geometry');
    p.prepare();
    p.take();
    p.drop();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
