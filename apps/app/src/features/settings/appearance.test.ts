/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appearanceAttributes, applyAppearance, resolveTheme, watchSystemAppearance } from './appearance';
import { DEFAULT_PREFS, PREFS_KEY, parsePrefs, reloadPrefs, setPref } from './prefs';

vi.mock('@fontsource-variable/atkinson-hyperlegible-next', () => ({}));
vi.mock('@fontsource-variable/jetbrains-mono', () => ({}));

type Listener = () => void;

/** matchMedia whose answers can change at runtime, like an OS setting would. */
function stubSystem(initial: Record<string, boolean> = {}) {
  const state = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return state[query] ?? false;
    },
    media: query,
    addEventListener: (_: string, l: Listener) => {
      const set = listeners.get(query) ?? new Set<Listener>();
      set.add(l);
      listeners.set(query, set);
    },
    removeEventListener: (_: string, l: Listener) => listeners.get(query)?.delete(l),
  })) as unknown as typeof window.matchMedia;
  return {
    set(query: string, value: boolean) {
      state[query] = value;
      for (const l of listeners.get(query) ?? []) l();
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

const DARK = '(prefers-color-scheme: dark)';
const MORE = '(prefers-contrast: more)';
const root = document.documentElement;
const ATTRIBUTES = ['data-theme', 'data-contrast', 'data-text-size', 'data-font'];

beforeEach(() => {
  window.localStorage.clear();
  for (const a of [...ATTRIBUTES, 'data-no-transition']) root.removeAttribute(a);
  root.style.colorScheme = '';
  reloadPrefs();
});

describe('resolveTheme', () => {
  it('passes an explicit choice through and maps System to the OS scheme', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('appearanceAttributes', () => {
  it('leaves defaults unmarked except the resolved theme', () => {
    const system = stubSystem({ [DARK]: true });
    expect(appearanceAttributes(DEFAULT_PREFS)).toEqual({
      'data-theme': 'dark',
      'data-contrast': null,
      'data-text-size': null,
      'data-font': null,
    });
    system.restore();
  });

  it('honors prefers-contrast while the pref is Off', () => {
    const system = stubSystem({ [MORE]: true });
    const attrs = appearanceAttributes(DEFAULT_PREFS);
    expect(attrs['data-contrast']).toBe('more');
    system.restore();
  });
});

describe('System theme', () => {
  it('follows the OS live and stops following once a theme is chosen', () => {
    const system = stubSystem({ [DARK]: false });
    const systemPrefs = parsePrefs({ theme: 'system' });
    const stop = watchSystemAppearance(() => applyAppearance(systemPrefs));
    applyAppearance(systemPrefs);
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.style.colorScheme).toBe('light');

    system.set(DARK, true);
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.style.colorScheme).toBe('dark');

    stop();
    system.set(DARK, false);
    expect(root).toHaveAttribute('data-theme', 'dark');

    applyAppearance(parsePrefs({ theme: 'light' }));
    expect(root).toHaveAttribute('data-theme', 'light');
    system.restore();
  });

  it('choosing System in the store resolves against the OS at that moment', () => {
    const system = stubSystem({ [DARK]: true });
    act(() => setPref('theme', 'light'));
    expect(root).toHaveAttribute('data-theme', 'light');
    act(() => setPref('theme', 'system'));
    expect(root).toHaveAttribute('data-theme', 'dark');
    system.restore();
  });
});

describe('applyAppearance', () => {
  it('sets one attribute per pref and clears them when back at the default', () => {
    applyAppearance(parsePrefs({ theme: 'light', font: 'mono', textSize: 'large', contrast: 'on' }));
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root).toHaveAttribute('data-font', 'mono');
    expect(root).toHaveAttribute('data-text-size', 'large');
    expect(root).toHaveAttribute('data-contrast', 'more');

    applyAppearance(parsePrefs({ theme: 'dark' }));
    expect(root).not.toHaveAttribute('data-font');
    expect(root).not.toHaveAttribute('data-text-size');
    expect(root).not.toHaveAttribute('data-contrast');
  });

  it('keeps the browser chrome colour in step with the resolved theme', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    applyAppearance(parsePrefs({ theme: 'light' }));
    expect(meta).toHaveAttribute('content', '#f4f4f4');
    applyAppearance(parsePrefs({ theme: 'dark' }));
    expect(meta).toHaveAttribute('content', '#000000');
    meta.remove();
  });

  it('holds transitions off for the switch and releases them within a few frames', async () => {
    applyAppearance(parsePrefs({ theme: 'dark' }));
    await vi.waitFor(() => expect(root).not.toHaveAttribute('data-no-transition'));
    applyAppearance(parsePrefs({ theme: 'light' }));
    expect(root).toHaveAttribute('data-no-transition');
    await vi.waitFor(() => expect(root).not.toHaveAttribute('data-no-transition'));
  });

  it('does not freeze anything when nothing changed', async () => {
    applyAppearance(parsePrefs({ theme: 'dark' }));
    await vi.waitFor(() => expect(root).not.toHaveAttribute('data-no-transition'));
    applyAppearance(parsePrefs({ theme: 'dark' }));
    expect(root).not.toHaveAttribute('data-no-transition');
  });
});

describe('store integration', () => {
  it('setPref writes the document attribute and the stored value in the same call', () => {
    act(() => setPref('theme', 'light'));
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}')).toMatchObject({ theme: 'light' });
    act(() => setPref('textSize', 'small'));
    expect(root).toHaveAttribute('data-text-size', 'small');
  });

  it('old saved prefs without the appearance keys still load with defaults', () => {
    expect(parsePrefs({ motion: 'reduced', odds: 'decimal' })).toMatchObject({
      motion: 'reduced',
      odds: 'decimal',
      theme: 'system',
      font: 'inter',
      textSize: 'medium',
      contrast: 'off',
    });
  });

  it('bad appearance values fall back per field', () => {
    expect(
      parsePrefs({ theme: 'sepia', font: 'comic', textSize: 'huge', contrast: 1, view: 'scene', transparency: 'on' }),
    ).toEqual(DEFAULT_PREFS);
  });
});

describe('public/theme-init.js (runs before paint)', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');
  const run = () => new Function(source)();

  it('applies saved prefs to <html>', () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ theme: 'light', font: 'atkinson', textSize: 'large', contrast: 'on' }),
    );
    run();
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.style.colorScheme).toBe('light');
    expect(root).toHaveAttribute('data-font', 'atkinson');
    expect(root).toHaveAttribute('data-text-size', 'large');
    expect(root).toHaveAttribute('data-contrast', 'more');
  });

  it('resolves System from the OS and survives corrupt storage', () => {
    const system = stubSystem({ [DARK]: true });
    window.localStorage.setItem(PREFS_KEY, '{not json');
    run();
    expect(root).toHaveAttribute('data-theme', 'dark');
    system.restore();
  });

  it('agrees with appearanceAttributes for the same prefs', () => {
    const prefs = parsePrefs({ theme: 'dark', font: 'mono', textSize: 'small', contrast: 'on' });
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    run();
    for (const [name, value] of Object.entries(appearanceAttributes(prefs))) {
      expect(root.getAttribute(name)).toBe(value);
    }
  });
});
