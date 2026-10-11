import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './chapters';
import { BEYOND_Z, blendPose, type Pose, poseAt, SCENE_ORDER, scenePose } from './scene/poses';
import { QualityGovernor } from './scene/quality';
import { LAYOUT, LOGO, QUALITY } from './scene/scene-tokens';
import { locate } from './story-scroll';

const VH = 800;
const ranges = (() => {
  let top = 0;
  return CHAPTERS.map((c) => {
    const height = (c.heightVh / 100) * VH;
    const r = { top, height, stage: VH };
    top += height;
    return r;
  });
})();

function flatten(p: Pose): number[] {
  const xs = [p.monolith, p.cube, p.ring, p.portal, ...p.slabs].flatMap((x) => [...x.p, ...x.r, x.s]);
  return [...xs, p.split, p.lift, p.glow, p.shatter, ...p.cam.p, ...p.cam.look];
}

describe('locate', () => {
  it('splits a chapter into hold then transition', () => {
    const hero = ranges[0];
    if (!hero) throw new Error('no hero');
    const pin = hero.height - VH;
    expect(locate(0, ranges)).toEqual({ chapter: 0, hold: 0, transition: 0 });
    expect(locate(pin / 2, ranges)).toMatchObject({ chapter: 0, hold: 0.5, transition: 0 });
    expect(locate(pin + VH / 2, ranges)).toMatchObject({ chapter: 0, hold: 1, transition: 0.5 });
    expect(locate(hero.height, ranges)).toMatchObject({ chapter: 1, hold: 0, transition: 0 });
  });

  it('never transitions out of the last chapter', () => {
    const last = ranges.at(-1);
    if (!last) throw new Error('no ranges');
    expect(locate(last.top + last.height, ranges)).toMatchObject({ chapter: CHAPTERS.length - 1, transition: 0 });
  });
});

describe('poses', () => {
  it('has one scene per chapter, in chapter order', () => {
    expect(SCENE_ORDER).toEqual(CHAPTERS.map((c) => c.scene));
  });

  for (const ctx of Object.values(LAYOUT)) {
    it(`is continuous across every chapter boundary (side=${ctx.side})`, () => {
      for (let i = 0; i < SCENE_ORDER.length - 1; i++) {
        // end of chapter i's transition === start of chapter i+1
        expect(flatten(poseAt(i, 1, 1, ctx))).toEqual(
          flatten(scenePose(i + 1, 0, ctx)).map((v) => expect.closeTo(v, 6)),
        );
        // start of the transition === end of the hold
        expect(flatten(poseAt(i, 1, 0, ctx))).toEqual(flatten(scenePose(i, 1, ctx)));
      }
    });

    it(`stays finite everywhere (side=${ctx.side})`, () => {
      for (let i = 0; i < SCENE_ORDER.length; i++) {
        for (let q = 0; q <= 1; q += 0.1) {
          for (const t of [0, 0.37, 1]) {
            for (const v of flatten(poseAt(i, q, t, ctx))) expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    });
  }

  it('dives the camera through the portal plane during the judge -> outcome transition', () => {
    const ctx = LAYOUT.wide;
    const judge = SCENE_ORDER.indexOf('judge');
    const before = poseAt(judge, 1, 0, ctx);
    const after = poseAt(judge, 1, 1, ctx);
    expect(before.cam.p[2]).toBeGreaterThan(before.portal.p[2]);
    expect(after.cam.p[2]).toBeLessThan(after.portal.p[2]);
    expect(blendPose(before, after, 0.5).portal.s).toBeGreaterThan(0);
  });
});

describe('ecosystem pose', () => {
  it('leaves the logos as the only focal point: no shards, no monolith, no cube', () => {
    const eco = SCENE_ORDER.indexOf('ecosystem');
    for (const ctx of Object.values(LAYOUT)) {
      const p = scenePose(eco, 0.5, ctx);
      expect(p.shatter).toBe(0);
      expect(p.monolith.s).toBe(0);
      expect(p.cube.s).toBe(0);
      // logos sit LOGO.depth in front of the camera, well clear of the scene behind
      expect(p.cam.p[2] - BEYOND_Z).toBeGreaterThan(LOGO.depth + 3);
    }
  });
});

describe('QualityGovernor', () => {
  const feed = (g: QualityGovernor, fps: number, seconds: number) => {
    let stepped = 0;
    for (let i = 0; i < Math.round(fps * seconds); i++) if (g.tick(1 / fps)) stepped++;
    return stepped;
  };

  it('never degrades a healthy device, however long it runs', () => {
    const g = new QualityGovernor(3);
    expect(feed(g, 75, 120)).toBe(0);
    expect(g.step).toBe(0);
  });

  it('does not degrade on oscillation between good and slow windows', () => {
    const g = new QualityGovernor(3);
    for (let k = 0; k < 30; k++) {
      feed(g, 75, 2);
      feed(g, 40, 2);
    }
    expect(g.step).toBe(0);
  });

  it('steps down one level per sustained slow stretch, up to the cap', () => {
    const g = new QualityGovernor(2);
    expect(feed(g, 30, QUALITY.settle + QUALITY.sustain + 0.5)).toBe(1);
    expect(feed(g, 30, 60)).toBe(1);
    expect(g.step).toBe(2);
  });

  it('ignores hitches (single long frames) as throughput evidence', () => {
    const g = new QualityGovernor(3);
    for (let i = 0; i < 200; i++) {
      g.tick(1 / 75);
      g.tick(0.6);
    }
    expect(g.step).toBe(0);
  });
});
