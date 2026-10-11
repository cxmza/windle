import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTERS } from '../story/chapters';
import { chapterPath } from '../story/routes';
import { APP_URL, activeProtocolId, DOCS_URL, isProtocolActive, PROTOCOL_ITEMS, SIGN_IN_URL } from './nav-data';
import { scrollProgress } from './nav-scroll';
import { SiteNav } from './SiteNav';

const live = vi.hoisted(() => ({ active: 0 }));
vi.mock('../story/story-scroll', () => ({
  useActiveChapter: () => ({ active: live.active, direction: 1 as const }),
}));

const chapterIndex = (id: string) => CHAPTERS.find((c) => c.id === id)?.index ?? -1;

beforeEach(() => {
  live.active = 0;
});

describe('SiteNav', () => {
  it('is the primary navigation with Protocol, Docs and Ecosystem', () => {
    render(<SiteNav />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('button', { name: 'Protocol' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^Docs/ })).toHaveAttribute('href', DOCS_URL);
    expect(within(nav).getByRole('link', { name: 'Ecosystem' })).toHaveAttribute('href', '/ecosystem');
  });

  it('offers Sign in and a Launch app that goes to the real app; X lives in the mobile sheet and footer only', () => {
    render(<SiteNav />);
    expect(screen.queryByRole('link', { name: /windle on X/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_URL);
    expect(screen.getByRole('link', { name: 'Launch app' })).toHaveAttribute('href', APP_URL);
  });

  it('has the brand lockup (with the jelly mark) linking to the top, and the stable hooks', () => {
    const { container } = render(<SiteNav />);
    const logo = container.querySelector('[data-header-logo]');
    expect(logo).toHaveAttribute('href', '/');
    expect(logo?.querySelector('[data-logo-jelly]')).not.toBeNull();
    expect(container.querySelector('[data-dock-root] [data-dock]')).not.toBeNull();
    expect(container.querySelector('[data-dock-progress] [data-dock-progress-fill]')).not.toBeNull();
    expect(container.querySelector('[data-dock-indicator]')).toBeNull();
  });

  it('never uses a hash href', () => {
    const { container } = render(<SiteNav />);
    for (const a of container.querySelectorAll('a')) expect(a.getAttribute('href')).not.toMatch(/#/);
  });

  it('marks no link current on the hero and exactly the active top-level link otherwise', () => {
    const hero = render(<SiteNav />);
    expect(hero.container.querySelectorAll('[data-dock-link][aria-current]')).toHaveLength(0);
    hero.unmount();

    live.active = chapterIndex('ecosystem');
    const { container } = render(<SiteNav />);
    const current = container.querySelectorAll('[data-dock-link][aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('data-dock-link', 'ecosystem');
    expect(current[0]).toHaveAttribute('aria-current', 'location');
    expect(container.querySelector('[data-dock-protocol]')).not.toHaveAttribute('data-active');
  });

  it('keeps one size and state at every scroll position: nothing collapses, hides or re-labels the bar', () => {
    const { container } = render(<SiteNav />);
    const root = container.querySelector('[data-dock-root]');
    const before = root?.outerHTML;
    for (const y of [0, 200, 1400, 90]) {
      act(() => {
        window.scrollY = y;
        window.dispatchEvent(new Event('scroll'));
      });
    }
    expect(root?.outerHTML).toBe(before);
    expect(root).not.toHaveAttribute('data-nav-state');
    expect(container.querySelector('[data-dock-signin]')).toBeInTheDocument();
  });

  it('lights the Protocol trigger for a chapter that only lives inside the menu', () => {
    live.active = chapterIndex('judge');
    const { container } = render(<SiteNav />);
    expect(container.querySelector('[data-dock-protocol]')).toHaveAttribute('data-active');
  });

  it('opens the Protocol menu with a row per chapter, marks the active one and closes on Escape', async () => {
    live.active = chapterIndex('collateral');
    const user = userEvent.setup();
    render(<SiteNav />);
    const trigger = screen.getByRole('button', { name: 'Protocol' });
    await user.click(trigger);
    const menu = document.querySelector<HTMLElement>('[data-dock-menu]');
    expect(menu).not.toBeNull();
    if (!menu) return;
    for (const item of PROTOCOL_ITEMS) {
      const row = menu.querySelector(`[data-dock-link=${item.id}]`);
      expect(row).toHaveAttribute('href', chapterPath(item.id));
      expect(row).toHaveTextContent(item.label);
      expect(row).toHaveTextContent(item.summary);
    }
    expect(menu.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(menu.querySelector('[data-dock-link=collateral]')).toHaveAttribute('aria-current', 'location');
    await user.keyboard('{Escape}');
    expect(document.querySelector('[data-dock-menu]')).toBeNull();
  });

  it('opens the mobile sheet with every group, traps focus, closes on Escape and returns focus', async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    const button = screen.getByRole('button', { name: 'Open menu' });
    await user.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    for (const item of PROTOCOL_ITEMS) {
      expect(within(sheet).getByRole('link', { name: new RegExp(item.label) })).toHaveAttribute(
        'href',
        chapterPath(item.id),
      );
    }
    expect(within(sheet).getByRole('link', { name: /^Docs/ })).toHaveAttribute('href', DOCS_URL);
    expect(within(sheet).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_URL);
    expect(within(sheet).getByRole('link', { name: /Follow on X/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Launch app' })).toHaveAttribute('href', APP_URL);
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes the sheet when a chapter is chosen', async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('link', { name: /Judge/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('nav-data helpers', () => {
  it('lists every narrative chapter between the hero and the final CTA, nothing else', () => {
    expect(PROTOCOL_ITEMS.map((i) => i.id)).toEqual(CHAPTERS.slice(1, -1).map((c) => c.id));
    expect(PROTOCOL_ITEMS.every((i) => i.summary.length > 0)).toBe(true);
  });

  it('maps the active chapter index to a menu id, or null outside the narrative', () => {
    expect(activeProtocolId(0)).toBeNull();
    expect(activeProtocolId(chapterIndex('ecosystem'))).toBe('ecosystem');
    expect(activeProtocolId(chapterIndex('cta'))).toBeNull();
    expect(activeProtocolId(99)).toBeNull();
  });

  it('keeps Ecosystem (own link) out of the Protocol trigger state, but not Market', () => {
    expect(isProtocolActive('judge')).toBe(true);
    expect(isProtocolActive('market')).toBe(true);
    expect(isProtocolActive('ecosystem')).toBe(false);
    expect(isProtocolActive(null)).toBe(false);
  });
});

describe('nav-scroll helpers', () => {
  it('clamps scroll progress to 0..1 and survives a page that cannot scroll', () => {
    expect(scrollProgress(0, 1000)).toBe(0);
    expect(scrollProgress(500, 1000)).toBe(0.5);
    expect(scrollProgress(2000, 1000)).toBe(1);
    expect(scrollProgress(-5, 1000)).toBe(0);
    expect(scrollProgress(10, 0)).toBe(0);
  });
});
