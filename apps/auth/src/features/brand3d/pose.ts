/**
 * Mark pose model: a rest pose, a slow idle sway, a damped pointer tilt and a drag offset that springs back.
 * Pure and frame-rate independent so it can be tested without a GL context.
 */
export type Pose = { yaw: number; pitch: number };

/** Resting attitude: turned a little so the thick side and the bevel catch the rim lights. */
export const REST: Pose = { yaw: -0.3, pitch: 0.13 };

export const POSE = {
  sway: { yaw: 0.07, pitch: 0.035, yawHz: 0.045, pitchHz: 0.033 },
  tilt: { yaw: 0.32, pitch: 0.2 },
  /** Drag radians per CSS pixel, clamped. */
  dragGain: 0.0065,
  dragMax: 0.95,
  /** Pointer inertia (higher = snappier) and the drag spring (heavy: slow, no wobble). */
  follow: 3.2,
  spring: { k: 26, c: 8.5 },
} as const;

export type PoseState = {
  tilt: Pose;
  drag: Pose;
  dragVel: Pose;
};

export function initialPoseState(): PoseState {
  return { tilt: { yaw: 0, pitch: 0 }, drag: { yaw: 0, pitch: 0 }, dragVel: { yaw: 0, pitch: 0 } };
}

export function clamp(v: number, lim: number) {
  return Math.max(-lim, Math.min(lim, v));
}

/** Idle sway at time `t` seconds. */
export function sway(t: number): Pose {
  const s = POSE.sway;
  return {
    yaw: Math.sin(t * Math.PI * 2 * s.yawHz) * s.yaw,
    pitch: Math.sin(t * Math.PI * 2 * s.pitchHz + 1.3) * s.pitch,
  };
}

/** Advance the state by `dt` seconds. `pointer` is -1..1 on both axes (or null when away), `dragging` freezes the spring. */
export function stepPose(
  s: PoseState,
  dt: number,
  pointer: { x: number; y: number } | null,
  dragging: boolean,
): { settled: boolean } {
  const step = Math.min(dt, 1 / 20);
  const target = pointer
    ? { yaw: pointer.x * POSE.tilt.yaw, pitch: -pointer.y * POSE.tilt.pitch }
    : { yaw: 0, pitch: 0 };
  const a = 1 - Math.exp(-POSE.follow * step);
  s.tilt.yaw += (target.yaw - s.tilt.yaw) * a;
  s.tilt.pitch += (target.pitch - s.tilt.pitch) * a;

  if (!dragging) {
    const { k, c } = POSE.spring;
    for (const axis of ['yaw', 'pitch'] as const) {
      s.dragVel[axis] += (-k * s.drag[axis] - c * s.dragVel[axis]) * step;
      s.drag[axis] += s.dragVel[axis] * step;
    }
  }

  const eps = 0.0004;
  const settled =
    Math.abs(target.yaw - s.tilt.yaw) < eps &&
    Math.abs(target.pitch - s.tilt.pitch) < eps &&
    Math.abs(s.drag.yaw) < eps &&
    Math.abs(s.drag.pitch) < eps &&
    Math.abs(s.dragVel.yaw) < eps &&
    Math.abs(s.dragVel.pitch) < eps;
  return { settled: settled && !dragging };
}

/** Final attitude: rest + sway + tilt + drag. */
export function composePose(s: PoseState, t: number, animated: boolean): Pose {
  const w = animated ? sway(t) : { yaw: 0, pitch: 0 };
  return {
    yaw: REST.yaw + w.yaw + s.tilt.yaw + s.drag.yaw,
    pitch: REST.pitch + w.pitch + s.tilt.pitch + s.drag.pitch,
  };
}
