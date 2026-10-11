import { describe, expect, it } from 'vitest';
import { BEYOND_Z, type LayoutCtx, SCENE_ORDER, scenePose } from './poses';
import { LAYOUT, MARK } from './scene-tokens';

const view = { tanHalfFov: Math.tan((35 * Math.PI) / 360), aspect: 1.6 };
const slot = { x: 0.7, y: 0.1, h: 0.6 };

/** NDC of a world point seen from a camera on the z axis at camZ looking at -z (no parallax). */
function ndc(p: readonly [number, number, number], camZ: number) {
  const d = camZ - p[2];
  const halfH = d * view.tanHalfFov;
  return { x: p[0] / (halfH * view.aspect), y: p[1] / halfH, h: 0 };
}

describe('mark slots', () => {
  const ctx: LayoutCtx = { ...LAYOUT.wide, slots: { hero: slot, cta: slot }, view };
  const hero = SCENE_ORDER.indexOf('hero');
  const cta = SCENE_ORDER.indexOf('cta');

  it('holds the hero mark on its slot through the camera dolly', () => {
    for (const q of [0, 0.5, 1]) {
      const pose = scenePose(hero, q, ctx);
      const at = ndc(pose.monolith.p, pose.cam.p[2]);
      expect(at.x).toBeCloseTo(slot.x, 6);
      expect(at.y).toBeCloseTo(slot.y, 6);
      // the mark's MARK.size box spans slot.h in NDC
      const halfH = (pose.cam.p[2] - pose.monolith.p[2]) * view.tanHalfFov;
      expect((pose.monolith.s * MARK.size) / halfH).toBeCloseTo(slot.h, 6);
    }
  });

  it('puts the CTA mark (and the cube sinking into it) on its slot beyond the portal', () => {
    const pose = scenePose(cta, 0.5, ctx);
    expect(pose.monolith.p[2]).toBe(BEYOND_Z);
    const at = ndc(pose.monolith.p, pose.cam.p[2]);
    expect(at.x).toBeCloseTo(slot.x, 6);
    expect(pose.cube.p).toEqual(pose.monolith.p);
  });

  it('falls back to the static placement without a measured slot', () => {
    expect(scenePose(hero, 0, LAYOUT.wide).monolith.p[0]).toBe(0);
  });
});
