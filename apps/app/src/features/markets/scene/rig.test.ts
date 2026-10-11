import { describe, expect, it } from 'vitest';
import { frameSlab, orbitPosition, spring, stepSpring } from './rig';

describe('stepSpring (critically damped)', () => {
  it('settles on the target without overshoot and reports when it stops', () => {
    const s = spring(0);
    let max = 0;
    let frames = 0;
    let within1pct = 0;
    while (stepSpring(s, 1, 9, 1 / 60) && frames < 600) {
      max = Math.max(max, s.x);
      frames++;
      if (!within1pct && 1 - s.x < 0.01) within1pct = frames;
    }
    expect(s.x).toBe(1);
    expect(s.v).toBe(0);
    expect(max).toBeLessThanOrEqual(1);
    // omega 9 is the orbit token, matched to --dur-slower (700 ms) by the 99% point
    expect(within1pct / 60).toBeGreaterThan(0.6);
    expect(within1pct / 60).toBeLessThan(0.8);
  });

  it('is frame-rate independent', () => {
    const a = spring(0);
    const b = spring(0);
    for (let i = 0; i < 30; i++) stepSpring(a, 1, 6.5, 1 / 60);
    for (let i = 0; i < 60; i++) stepSpring(b, 1, 6.5, 1 / 120);
    expect(a.x).toBeCloseTo(b.x, 6);
  });

  it('keeps its velocity when the target changes mid-flight (interruptible)', () => {
    const s = spring(0);
    for (let i = 0; i < 10; i++) stepSpring(s, 1, 6.5, 1 / 60);
    const v = s.v;
    stepSpring(s, 0, 6.5, 1 / 60);
    expect(v).toBeGreaterThan(0);
    expect(s.x).toBeGreaterThan(0); // still travelling forward this frame, then turns
  });
});

describe('orbitPosition', () => {
  it('puts the camera straight in front of the pivot at yaw = pitch = 0', () => {
    const out: [number, number, number] = [0, 0, 0];
    orbitPosition(0, 0, 14, [0, 0, -4], out);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(10);
  });
});

describe('frameSlab', () => {
  it('fills the requested share of the height when nothing covers the view', () => {
    const f = frameSlab({
      slabW: 1.6,
      slabH: 1,
      fov: 38,
      aspect: 1.6,
      coverRight: 0,
      coverBottom: 0,
      fill: 0.44,
      maxWidthShare: 0.78,
    });
    const visibleH = 2 * f.distance * Math.tan((19 * Math.PI) / 180);
    expect(1 / visibleH).toBeCloseTo(0.44);
    expect(f.offsetX).toBe(0);
    expect(f.offsetY).toBeCloseTo(0);
  });

  it('shifts the slab into the free region beside a side panel or above a sheet', () => {
    const side = frameSlab({
      slabW: 1.6,
      slabH: 1,
      fov: 38,
      aspect: 1.6,
      coverRight: 0.3,
      coverBottom: 0,
      fill: 0.44,
      maxWidthShare: 0.78,
    });
    expect(side.offsetX).toBeGreaterThan(0); // camera looks right of the slab -> slab appears left
    const sheet = frameSlab({
      slabW: 1.6,
      slabH: 1,
      fov: 52,
      aspect: 0.46,
      coverRight: 0,
      coverBottom: 0.6,
      fill: 0.3,
      maxWidthShare: 0.78,
    });
    expect(sheet.offsetY).toBeLessThan(0); // camera looks below -> slab appears above the sheet
    // on a narrow screen the width bound wins over the height fill
    const visibleW = 2 * sheet.distance * Math.tan((26 * Math.PI) / 180) * 0.46;
    expect(1.6 / visibleW).toBeLessThanOrEqual(0.78 + 1e-9);
  });
});
