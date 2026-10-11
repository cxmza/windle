import { describe, expect, it } from 'vitest';
import { JELLY } from '@/lib/motion-tokens';
import {
  advanceSpring,
  atRestSpring,
  clampDt,
  classicKeyframes,
  dragOffset,
  dragTransform,
  isAtRest,
  MARK_BOX,
  stepSpring,
  stretchOf,
} from './jelly';

const simulate = (x: number, y: number, seconds: number, dt = 1 / 60) => {
  const s = { ...atRestSpring(), x, y };
  const xs: number[] = [];
  for (let t = 0; t < seconds; t += dt) xs.push(stepSpring(s, dt).x);
  return { s, xs };
};

describe('drag spring (k=220, c=7)', () => {
  it('overshoots past the origin, then settles to rest', () => {
    const { s, xs } = simulate(34, 0, 3);
    expect(Math.min(...xs)).toBeLessThan(-10); // a visible jelly overshoot, not a critically damped return
    expect(isAtRest(s)).toBe(true);
  });

  it('is not at rest yet half a second after release (it wobbles)', () => {
    expect(isAtRest(simulate(34, 0, 0.5).s)).toBe(false);
  });

  it('moves both axes the same way (isotropic)', () => {
    const a = simulate(20, 0, 0.3).s;
    const b = simulate(0, 20, 0.3).s;
    expect(a.x).toBeCloseTo(b.y, 10);
  });

  it('settles at the same wall-clock time at 10fps and 120fps (sub-stepped)', () => {
    const at = (fps: number) => {
      const s = { ...atRestSpring(), x: 34 };
      for (let t = 0; t < 0.4; t += 1 / fps) advanceSpring(s, clampDt(1000 / fps));
      return s.x;
    };
    expect(at(10)).toBeCloseTo(at(120), 0);
  });

  it('clamps long frames so a background tab cannot explode the spring', () => {
    expect(clampDt(1000)).toBe(JELLY.maxDt);
    expect(clampDt(16)).toBeCloseTo(0.016);
    expect(clampDt(Number.NaN)).toBeCloseTo(1 / 60);
  });
});

describe('dragOffset', () => {
  it('follows half the pointer travel in mark units', () => {
    // 120px mark: 1px = 1 unit, half follow
    expect(dragOffset(20, 0, 120)).toEqual({ x: 10, y: 0 });
  });

  it('clamps to the 38-unit radius, scaled to the rendered mark', () => {
    const big = dragOffset(1000, 0, 120);
    expect(big.x).toBeCloseTo(JELLY.maxOffset);
    // a 24px dock mark: same unit clamp, i.e. 38 * 24 / 120 = 7.6px on screen
    const small = dragOffset(300, 400, 24);
    expect(Math.hypot(small.x, small.y)).toBeCloseTo(JELLY.maxOffset);
    expect((Math.hypot(small.x, small.y) * 24) / MARK_BOX).toBeCloseTo(7.6);
  });

  it('is zero for an unmeasured mark', () => {
    expect(dragOffset(50, 50, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('stretch', () => {
  it('st = min(len / 70, 0.45) along the drag direction', () => {
    expect(stretchOf(35, 0).st).toBe(0.45); // 0.5 capped
    expect(stretchOf(14, 0).st).toBeCloseTo(0.2);
    expect(stretchOf(0, 38).st).toBe(0.45);
    expect(stretchOf(0, 10).deg).toBeCloseTo(90);
  });

  it('renders scale(1+st, 1-0.55st) and px translation', () => {
    const t = dragTransform({ x: 14, y: 0, vx: 0, vy: 0 }, 120);
    expect(t).toBe('translate(14px, 0px) rotate(0deg) scale(1.2, 0.89) rotate(0deg)');
    expect(dragTransform({ x: 30, y: 0, vx: 0, vy: 0 }, 24)).toContain('translate(6px, 0px)');
  });
});

describe('classic keyframes', () => {
  it('matches the approved j1 keyframes at full strength, rescaled to the wobble', () => {
    const k = classicKeyframes();
    expect(k.map((f) => f.transform)).toEqual([
      'none',
      'scale(1.2, 0.8)',
      'scale(0.86, 1.16) skewX(-4deg)',
      'scale(1.08, 0.93) skewX(3deg)',
      'scale(0.97, 1.04)',
      'none',
    ]);
    expect(k[0]?.offset).toBe(0);
    expect(k.at(-1)?.offset).toBe(1);
    expect(k[1]?.offset).toBeCloseTo(0.08 / 0.48, 3);
  });

  it('scales every deformation with amp', () => {
    const half = classicKeyframes(0.5);
    expect(half[1]?.transform).toBe('scale(1.1, 0.9)');
    expect(half[2]?.transform).toBe('scale(0.93, 1.08) skewX(-2deg)');
  });
});
