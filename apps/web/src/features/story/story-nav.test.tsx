import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTER_SEO } from '../../../scripts/chapter-seo.ts';

const scroll = vi.hoisted(() => ({ scrollToY: vi.fn() }));
vi.mock('@/lib/smooth-scroll', () => scroll);
vi.mock('./story-scroll', () => ({
  useActiveChapter: () => ({ active: 0, direction: 1 as const }),
  whenStoryReady: () => Promise.resolve(),
}));

import { useStoryRouting } from './story-nav';

function Harness() {
  useStoryRouting();
  return (
    <>
      <section id="market" />
      <a href="/market">in app</a>
      <a href="https://docs.windle.fun">external</a>
      <a href="/market" target="_blank" rel="noopener">
        blank
      </a>
    </>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  scroll.scrollToY.mockClear();
});
afterEach(() => window.history.replaceState(null, '', '/'));

describe('useStoryRouting', () => {
  it('pushes the clean path, retitles and scrolls on a plain click', () => {
    const { getByText } = render(<Harness />);
    const notPrevented = fireEvent.click(getByText('in app'));
    expect(notPrevented).toBe(false);
    expect(window.location.pathname).toBe('/market');
    expect(window.location.hash).toBe('');
    expect(document.title).toBe(CHAPTER_SEO.market.title);
    expect(scroll.scrollToY).toHaveBeenCalledTimes(1);
  });

  it('leaves external links, new-tab links and modified clicks to the browser', () => {
    const { getByText } = render(<Harness />);
    expect(fireEvent.click(getByText('external'))).toBe(true);
    expect(fireEvent.click(getByText('blank'))).toBe(true);
    expect(fireEvent.click(getByText('in app'), { ctrlKey: true })).toBe(true);
    expect(window.location.pathname).toBe('/');
    expect(scroll.scrollToY).not.toHaveBeenCalled();
  });

  it('scrolls to the chapter of the restored path on popstate', () => {
    render(<Harness />);
    window.history.replaceState(null, '', '/market');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(scroll.scrollToY).toHaveBeenCalledTimes(1);
    expect(document.title).toBe(CHAPTER_SEO.market.title);
  });
});
