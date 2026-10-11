import { describe, expect, it } from 'vitest';
import { HAND } from '@/lib/motion-tokens';
import { drawOn, noteDuration, strokeDuration } from './draw-on';

function annotation(): HTMLElement {
  const root = document.createElement('span');
  root.innerHTML = `
    <svg>
      <g data-stroke="a.shaft" data-stroke-role="shaft"><mask><path data-stroke-center data-length="90"></path></mask></g>
      <g data-stroke="a.head" data-stroke-role="head"><mask><path data-stroke-center data-length="12"></path></mask></g>
    </svg>
    <span data-annotation-note>price = odds</span>`;
  return root;
}

describe('draw-on timing', () => {
  it('clamps stroke duration between the min and max tokens', () => {
    expect(strokeDuration(0)).toBe(HAND.strokeMin);
    expect(strokeDuration(90)).toBeCloseTo(90 / HAND.speed);
    expect(strokeDuration(10_000)).toBe(HAND.strokeMax);
  });

  it('writes notes at a per-char pace, clamped', () => {
    expect(noteDuration('')).toBe(HAND.noteMin);
    expect(noteDuration('x'.repeat(500))).toBe(HAND.noteMax);
  });
});

describe('drawOn', () => {
  it('hides strokes and note on build, in stroke order, and the timeline ends fully drawn', () => {
    const root = annotation();
    const tl = drawOn([root]);
    const centers = root.querySelectorAll<SVGPathElement>('[data-stroke-center]');
    for (const c of centers) expect(c.style.strokeDashoffset).toBe('1');
    const note = root.querySelector<HTMLElement>('[data-annotation-note]');
    expect(note?.style.clipPath).toContain('100%');
    // shaft + pen lift + head + pen lift + note
    const expected = strokeDuration(90) + HAND.headGap + strokeDuration(12) + HAND.gap + noteDuration('price = odds');
    expect(tl.duration()).toBeCloseTo(expected, 5);
    tl.progress(1);
    for (const c of centers) expect(c.style.strokeDashoffset).toBe('0');
    tl.revert();
    // reverted = finished drawing: the natural offset 0, which addDrawOn pins inline before building (perf, see there)
    for (const c of centers) expect(c.style.strokeDashoffset).toBe('0');
    expect(note?.style.clipPath).toBe('none');
  });
});
