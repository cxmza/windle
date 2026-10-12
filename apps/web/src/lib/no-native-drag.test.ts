import { afterEach, describe, expect, it } from 'vitest';
import { preventNativeDrag } from './no-native-drag';

function dragStart(el: Node): boolean {
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('preventNativeDrag', () => {
  let stop = () => {};
  afterEach(() => {
    stop();
    document.body.innerHTML = '';
  });

  it('cancels native drag on images, links, buttons, svg parts and canvases', () => {
    document.body.innerHTML =
      '<img id="i" alt=""><a id="a" href="/"><span id="in">x</span></a><button id="b">b</button><svg><path id="p"/></svg><canvas id="c"></canvas>';
    stop = preventNativeDrag();
    for (const id of ['i', 'a', 'in', 'b', 'p', 'c']) {
      const el = document.getElementById(id);
      if (!el) throw new Error(id);
      expect(dragStart(el)).toBe(true);
    }
  });

  it('leaves body copy draggable and pointer events untouched', () => {
    document.body.innerHTML = '<p id="t">copy</p><a id="a" href="/">x</a>';
    stop = preventNativeDrag();
    const text = document.getElementById('t')?.firstChild;
    if (!text) throw new Error('text');
    expect(dragStart(text)).toBe(false);
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    document.getElementById('a')?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
  });

  it('removes the listener on cleanup', () => {
    document.body.innerHTML = '<img id="i" alt="">';
    preventNativeDrag()();
    const img = document.getElementById('i');
    if (!img) throw new Error('img');
    expect(dragStart(img)).toBe(false);
  });
});
