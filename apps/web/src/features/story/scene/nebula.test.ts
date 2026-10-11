import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../chapters';
import { applyMood, createNebulaMaterial, moodAt, moodState } from './nebula';
import { NEBULA, NEBULA_MOODS } from './scene-tokens';

describe('nebula moods', () => {
  it('has one mood per chapter', () => {
    expect(NEBULA_MOODS).toHaveLength(CHAPTERS.length);
  });

  it('holds a chapter mood and eases into the next one over the transition', () => {
    const out = moodState();
    expect(moodAt(2, 0, out)).toEqual(NEBULA_MOODS[2]?.map((b) => [...b]));
    expect(moodAt(2, 1, out)).toEqual(NEBULA_MOODS[3]?.map((b) => [...b]));
    const mid = moodAt(2, 0.5, out)[0]?.[0] ?? Number.NaN;
    const a = NEBULA_MOODS[2]?.[0]?.[0] ?? 0;
    const b = NEBULA_MOODS[3]?.[0]?.[0] ?? 0;
    expect(mid).toBeCloseTo((a + b) / 2, 5);
  });

  it('clamps past the last chapter', () => {
    const last = NEBULA_MOODS.length - 1;
    expect(moodAt(last, 1, moodState())).toEqual(NEBULA_MOODS[last]?.map((bl) => [...bl]));
  });

  it('follows the target and uploads it to the uniforms', () => {
    const m = createNebulaMaterial();
    const cur = moodState(0);
    const target = moodState(1);
    applyMood(cur, target, 1, m.uniforms);
    expect(m.uniforms.uBlob.value[0]?.x).toBeCloseTo(NEBULA_MOODS[1]?.[0]?.[0] ?? 0, 6);
    expect(m.uniforms.uCyan.value[0]).toBeCloseTo(NEBULA_MOODS[1]?.[0]?.[4] ?? 0, 6);
    m.dispose();
  });

  it('caps luminance low enough for 4.5:1 white text', () => {
    expect(1.05 / (NEBULA.maxLuminance + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
