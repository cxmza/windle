import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingHand } from './DrawingHand';
import { endStroke, getHandState, startStroke, subscribeHand } from './hand-bus';
import { markLogoExtruded, markLogoSketched, onLogoSketched, resetLogo } from './logo-sketch';
import { dashProgress, tipOf } from './stroke-tip';

afterEach(() => endStroke());

describe('hand bus', () => {
  it('goes drawing -> idle and notifies subscribers', () => {
    const listener = vi.fn();
    const off = subscribeHand(listener);
    const el = document.createElement('div');
    const token = startStroke(el);
    expect(getHandState()).toMatchObject({ status: 'drawing', el, token });
    endStroke(token);
    expect(getHandState()).toEqual({ status: 'idle' });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    startStroke(el);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('lets a new stroke take over and ignores the stale end', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const tokenA = startStroke(a);
    startStroke(b);
    endStroke(tokenA);
    expect(getHandState()).toMatchObject({ status: 'drawing', el: b });
    endStroke();
    expect(getHandState().status).toBe('idle');
  });
});

describe('stroke tip', () => {
  function fakePath(offset: string) {
    const svg = { getScreenCTM: () => ({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 }) };
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.style.strokeDashoffset = offset;
    Object.defineProperty(el, 'ownerSVGElement', { value: svg });
    Object.assign(el, {
      getTotalLength: () => 100,
      getPointAtLength: (len: number) => ({ x: len, y: 5 }),
    });
    return el;
  }

  it('reads progress from stroke-dashoffset (pathLength = 1)', () => {
    expect(dashProgress(fakePath('0.25px'))).toBeCloseTo(0.75, 6);
  });

  it('maps the point at the drawn length through the svg screen matrix', () => {
    const state = { status: 'drawing', el: fakePath('0.5px'), token: 1, progress: null } as const;
    expect(tipOf(state)).toEqual({ x: 2 * 50 + 10, y: 2 * 5 + 20, progress: 0.5 });
  });

  it('prefers an explicit progress function and returns null when idle or unmeasurable', () => {
    const state = { status: 'drawing', el: fakePath('1px'), token: 1, progress: () => 1 } as const;
    expect(tipOf(state)?.x).toBe(2 * 100 + 10);
    expect(tipOf({ status: 'idle' })).toBeNull();
    expect(tipOf({ status: 'drawing', el: document.createElement('div'), token: 2, progress: null })).toBeNull();
  });
});

describe('DrawingHand', () => {
  it('is an inert aria-hidden overlay that shows only while a stroke is active', () => {
    const { container } = render(<DrawingHand />);
    const root = container.querySelector('[data-drawing-hand]');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveClass('pointer-events-none');
    expect(root).toHaveAttribute('data-hand-state', 'idle');
    act(() => {
      startStroke(document.createElement('div'));
    });
    expect(root).toHaveAttribute('data-hand-state', 'drawing');
    act(() => endStroke());
    expect(root).toHaveAttribute('data-hand-state', 'idle');
  });

  it('renders nothing under reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query.includes('prefers-reduced-motion: reduce'),
    })) as typeof window.matchMedia;
    try {
      const { container } = render(<DrawingHand />);
      expect(container.querySelector('[data-drawing-hand]')).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('logo sketch handoff', () => {
  it('flips the slot state and dispatches story:logo-sketched with the slot id', () => {
    document.body.innerHTML = '<div data-logo-slot="x" data-logo-state="sketch"></div>';
    const seen: string[] = [];
    const off = onLogoSketched((slot) => seen.push(slot));
    const slot = document.querySelector<HTMLElement>('[data-logo-slot=x]');
    markLogoSketched('x');
    expect(seen).toEqual(['x']);
    expect(slot?.dataset.logoState).toBe('sketched');
    markLogoExtruded('x');
    expect(slot?.dataset.logoState).toBe('extruded');
    resetLogo('x');
    expect(slot?.dataset.logoState).toBe('sketch');
    off();
    markLogoSketched('x');
    expect(seen).toEqual(['x']);
    document.body.innerHTML = '';
  });
});
