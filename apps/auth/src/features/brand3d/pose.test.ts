import { describe, expect, it } from 'vitest';
import { composePose, initialPoseState, POSE, REST, stepPose } from './pose';

describe('mark pose', () => {
  it('is the rest pose when nothing moves it and animation is off', () => {
    expect(composePose(initialPoseState(), 12, false)).toEqual(REST);
  });

  it('sways only a few degrees around the rest pose', () => {
    for (let t = 0; t < 120; t += 3) {
      const p = composePose(initialPoseState(), t, true);
      expect(Math.abs(p.yaw - REST.yaw)).toBeLessThanOrEqual(POSE.sway.yaw + 1e-9);
      expect(Math.abs(p.pitch - REST.pitch)).toBeLessThanOrEqual(POSE.sway.pitch + 1e-9);
    }
  });

  it('follows the pointer with inertia and returns when it leaves', () => {
    const s = initialPoseState();
    stepPose(s, 1 / 60, { x: 1, y: 0 }, false);
    expect(s.tilt.yaw).toBeGreaterThan(0);
    expect(s.tilt.yaw).toBeLessThan(POSE.tilt.yaw * 0.2);
    for (let i = 0; i < 600; i++) stepPose(s, 1 / 60, { x: 1, y: 0 }, false);
    expect(s.tilt.yaw).toBeCloseTo(POSE.tilt.yaw, 2);
    let settled = false;
    for (let i = 0; i < 900 && !settled; i++) settled = stepPose(s, 1 / 60, null, false).settled;
    expect(settled).toBe(true);
    expect(s.tilt.yaw).toBeCloseTo(0, 2);
  });

  it('springs a dragged pose back to rest without overshooting wildly', () => {
    const s = initialPoseState();
    s.drag.yaw = 0.8;
    let min = 0;
    let settled = false;
    for (let i = 0; i < 1200 && !settled; i++) {
      settled = stepPose(s, 1 / 60, null, false).settled;
      min = Math.min(min, s.drag.yaw);
    }
    expect(settled).toBe(true);
    expect(min).toBeGreaterThan(-0.2);
    expect(Math.abs(s.drag.yaw)).toBeLessThan(0.001);
  });

  it('holds the drag while the pointer is down', () => {
    const s = initialPoseState();
    s.drag.yaw = 0.5;
    const r = stepPose(s, 1 / 60, null, true);
    expect(s.drag.yaw).toBe(0.5);
    expect(r.settled).toBe(false);
  });
});
