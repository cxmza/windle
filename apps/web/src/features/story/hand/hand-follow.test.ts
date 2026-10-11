import { afterEach, describe, expect, it } from 'vitest';
import { drawOn } from './draw-on';
import { HAND_HULL_PX } from './HandArt';
import { endStroke, getHandState } from './hand-bus';
import { FOLLOW, hullBounds, type Offset, pickPose, poseClear, stepOffset } from './hand-follow';
import { handCanDraw } from './hand-gate';

const DT = 1 / 60;

describe('hand spring (offset from the tip)', () => {
  it('eases a hop out and settles exactly on the tip', () => {
    const s: Offset = { e: { x: 280, y: 240 }, de: { x: 0, y: 0 } };
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      stepOffset(s, DT, FOLLOW.omega);
      peak = Math.max(peak, -s.e.x);
    }
    expect(Math.hypot(s.e.x, s.e.y)).toBeLessThan(0.5);
    // critically damped: no visible overshoot past the tip
    expect(peak).toBeLessThan(2);
  });

  it('stays stable on very long frames (a starved tab)', () => {
    const s: Offset = { e: { x: 280, y: 240 }, de: { x: 0, y: 0 } };
    for (let i = 0; i < 10; i++) stepOffset(s, 0.5);
    expect(Math.hypot(s.e.x, s.e.y)).toBeLessThan(0.5);
  });

  it('keeps a settled hand on the tip while the tip moves (nib stays on the ink)', () => {
    const s: Offset = { e: { x: 0, y: 0 }, de: { x: 0, y: 0 } };
    for (let i = 0; i < 30; i++) stepOffset(s, DT);
    expect(s.e).toEqual({ x: 0, y: 0 });
  });
});

describe('draw-on summons the hand', () => {
  afterEach(() => endStroke());

  function drawing(): HTMLElement {
    const root = document.createElement('span');
    root.innerHTML =
      '<svg><g data-stroke="a.s"><mask><path data-stroke-center data-length="30"></path></mask></g></svg>';
    document.body.append(root);
    return root;
  }

  it('skips the hand for drawings with no box (off-screen / not laid out)', () => {
    const root = drawing();
    const center = root.querySelector('[data-stroke-center]');
    expect(center && handCanDraw(center)).toBe(false);
    const tl = drawOn([root]);
    tl.progress(0.5);
    expect(getHandState().status).toBe('idle');
    tl.revert();
    root.remove();
  });

  it('never summons the hand when opted out', () => {
    const root = drawing();
    const tl = drawOn([root], { hand: false });
    tl.progress(0.5);
    expect(getHandState().status).toBe('idle');
    tl.revert();
    root.remove();
  });
});

describe('hand pose (keeps clear of [data-hand-avoid] text)', () => {
  const nib = { x: 300, y: 400 };
  const box = (b: Partial<{ left: number; top: number; right: number; bottom: number }>) => ({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    ...b,
  });

  it('the art as drawn sits up-right of the nib; the swung pose sits down-right', () => {
    const asDrawn = hullBounds(HAND_HULL_PX, 0, nib);
    expect(asDrawn.bottom).toBeLessThanOrEqual(nib.y + 1);
    expect(asDrawn.top).toBeLessThan(nib.y - 80);
    const swung = hullBounds(HAND_HULL_PX, FOLLOW.poses[FOLLOW.poses.length - 1] ?? 0, nib);
    expect(swung.top).toBeGreaterThan(nib.y - 20);
    expect(swung.right).toBeGreaterThan(nib.x + 80);
  });

  it('keeps the drawn pose when nothing is in the way', () => {
    expect(pickPose(HAND_HULL_PX, FOLLOW.poses, nib, [], 0)).toBe(0);
  });

  it('swings away from text just above the nib (market chip small print over its arrow)', () => {
    const smallPrint = box({ left: 280, top: 340, right: 500, bottom: 380 });
    const i = pickPose(HAND_HULL_PX, FOLLOW.poses, nib, [smallPrint], 0);
    expect(i).toBeGreaterThan(0);
    const b = hullBounds(HAND_HULL_PX, FOLLOW.poses[i] ?? 0, nib);
    expect(b.top).toBeGreaterThan(smallPrint.bottom);
  });

  it('veils (-1) when text is on both sides', () => {
    const above = box({ left: 280, top: 340, right: 500, bottom: 380 });
    const below = box({ left: 300, top: 420, right: 500, bottom: 460 });
    expect(pickPose(HAND_HULL_PX, FOLLOW.poses, nib, [above, below], 0)).toBe(-1);
  });

  it('tests the silhouette, not its bounding box (a box just off the wrist stays clear)', () => {
    const offWrist = box({ left: nib.x + 150, top: nib.y - 3, right: nib.x + 170, bottom: nib.y + 10 });
    const b = hullBounds(HAND_HULL_PX, 0, nib);
    expect(b.bottom).toBeGreaterThan(offWrist.top); // the bounding boxes overlap...
    expect(poseClear(HAND_HULL_PX, 0, nib, [offWrist], 0)).toBe(true); // ...the hand does not
    expect(
      poseClear(
        HAND_HULL_PX,
        0,
        nib,
        [box({ left: nib.x + 60, top: nib.y - 60, right: nib.x + 70, bottom: nib.y - 50 })],
        0,
      ),
    ).toBe(false);
  });

  it('does not flip back while the current pose is still clear', () => {
    expect(pickPose(HAND_HULL_PX, FOLLOW.poses, nib, [], 1)).toBe(1);
  });
});
