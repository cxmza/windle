import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTERS } from '../story/chapters';
import { chapterPath } from '../story/routes';
import { buildLensMap, LENS_BEZEL } from './LiquidGlassDefs';
import { APP_URL, activeProtocolId, DOCS_URL, isProtocolActive, PROTOCOL_TARGET, SIGN_IN_URL } from './nav-data';
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
    expect(within(nav).getByRole('link', { name: 'Protocol' })).toHaveAttribute('href', '/promise');
    expect(within(nav).queryByRole('button', { name: 'Protocol' })).toBeNull();
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
    expect(container.querySelector('[data-dock-root] [data-dock-actions]')).not.toBeNull();
    expect(container.querySelector('[data-dock-bubble]')).not.toBeNull();
    expect(container.querySelector('[data-dock-progress]')).toBeNull();
  });

  it('keeps the logo on the page and glass islands only for the capsule and the actions', () => {
    const { container } = render(<SiteNav />);
    expect(container.querySelectorAll('[data-dock-island]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-dock-island] [data-glass]')).toHaveLength(2);
    const logo = container.querySelector('[data-header-logo]');
    expect(logo?.closest('[data-dock-island]')).toBeNull();
    expect(container.querySelector('[data-dock] [data-dock-protocol]')).not.toBeNull();
    expect(container.querySelector('[data-dock-actions] [data-dock-cta]')).not.toBeNull();
    expect(container.querySelector('[data-dock-actions] [data-dock-signin]')).not.toBeNull();
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

  it('lights the Protocol link for any chapter 01-06', () => {
    live.active = chapterIndex('judge');
    const { container } = render(<SiteNav />);
    expect(container.querySelector('[data-dock-protocol]')).toHaveAttribute('data-active');
  });

  it('has no dropdown: Protocol is a plain link to chapter 01 and nothing opens on click', async () => {
    const user = userEvent.setup();
    const { container } = render(<SiteNav />);
    const link = screen.getByRole('link', { name: 'Protocol' });
    expect(link).toHaveAttribute('href', chapterPath(PROTOCOL_TARGET));
    expect(PROTOCOL_TARGET).toBe('promise');
    expect(link).not.toHaveAttribute('aria-haspopup');
    expect(link).not.toHaveAttribute('aria-expanded');
    expect(link.querySelector('svg')).toBeNull();
    await user.click(link);
    expect(container.querySelector('[data-dock-menu]')).toBeNull();
  });

  it('opens the mobile sheet with the same items as the bar, traps focus, closes on Escape and returns focus', async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    const button = screen.getByRole('button', { name: 'Open menu' });
    await user.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(sheet).getByRole('link', { name: 'Protocol' })).toHaveAttribute('href', chapterPath('promise'));
    expect(within(sheet).getByRole('link', { name: 'Ecosystem' })).toHaveAttribute('href', chapterPath('ecosystem'));
    expect(within(sheet).queryByRole('link', { name: /Judge|Collateral/ })).toBeNull();
    expect(within(sheet).getByRole('link', { name: /^Docs/ })).toHaveAttribute('href', DOCS_URL);
    expect(within(sheet).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_URL);
    expect(within(sheet).getByRole('link', { name: /Follow on X/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Launch app' })).toHaveAttribute('href', APP_URL);
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes the sheet when Protocol is chosen', async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('link', { name: 'Protocol' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('nav-data helpers', () => {
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

describe('buildLensMap', () => {
  const width = 120;
  const height = 48;
  const map = buildLensMap({ width, height });
  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return { r: map[i] ?? 0, g: map[i + 1] ?? 0, a: map[i + 3] ?? 0 };
  };

  it('has one opaque RGBA texel per pixel', () => {
    expect(map).toHaveLength(width * height * 4);
    expect(at(10, 10).a).toBe(255);
  });

  it('is nearly neutral in the flat centre', () => {
    const c = at(width / 2, height / 2);
    expect(Math.abs(c.r - 128)).toBeLessThan(6);
    expect(Math.abs(c.g - 128)).toBeLessThan(6);
  });

  it('bends strongest at the rim, toward the centre, and fades by the bezel width', () => {
    const top = at(width / 2, 0);
    const bottom = at(width / 2, height - 1);
    expect(top.g).toBeGreaterThan(180);
    expect(bottom.g).toBeLessThan(76);
    expect(Math.abs(at(width / 2, LENS_BEZEL + 4).g - 128)).toBeLessThan(Math.abs(top.g - 128) / 3);
  });
});
