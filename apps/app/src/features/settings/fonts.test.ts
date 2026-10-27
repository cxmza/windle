import { describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ atkinson: 0 }));

vi.mock('@fontsource-variable/atkinson-hyperlegible-next', () => {
  loaded.atkinson += 1;
  return {};
});

const { loadFont } = await import('./fonts');

describe('loadFont', () => {
  it('loads nothing for the default, the system stack and mono', async () => {
    loadFont('inter');
    loadFont('system');
    loadFont('mono');
    await Promise.resolve();
    expect(loaded).toEqual({ atkinson: 0 });
  });

  it('fetches a chosen font once, however often it is requested', async () => {
    loadFont('atkinson');
    loadFont('atkinson');
    await vi.waitFor(() => expect(loaded.atkinson).toBe(1));
    loadFont('atkinson');
    expect(loaded.atkinson).toBe(1);
  });
});
