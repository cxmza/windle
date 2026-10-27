import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '@/features/session/session-context';
import { getPrefs, reloadPrefs } from './prefs';
import { SettingsDialog } from './SettingsDialog';

vi.mock('@fontsource-variable/atkinson-hyperlegible-next', () => ({}));
vi.mock('@fontsource-variable/jetbrains-mono', () => ({}));

const session = {
  session: {
    authenticated: true as const,
    userId: '4f7f4a0e-6a58-4d8c-9d63-0a8a9a2f6a11',
    address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    expiresAt: '2026-11-11T12:00:00Z',
  },
  signOut: { run: vi.fn(), pending: false, failed: false },
};

const originalMatchMedia = window.matchMedia;
const root = document.documentElement;

function renderAt(url: string) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext value={session}>
        <MemoryRouter initialEntries={[url]}>
          <SettingsDialog />
        </MemoryRouter>
      </SessionContext>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  for (const a of ['data-theme', 'data-contrast', 'data-text-size', 'data-font']) root.removeAttribute(a);
  reloadPrefs();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ id: 'x', createdAt: '2026-10-11T12:00:00Z', wallets: [] })),
  );
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
});

const dialog = () => screen.getByRole('dialog');
const nav = () => screen.getByRole('navigation', { name: 'Settings sections' });

describe('Appearance rows', () => {
  it('lead General under an Appearance heading', () => {
    renderAt('/?settings=general');
    const appearance = screen.getByRole('region', { name: 'Appearance' });
    const labels = Array.from(appearance.querySelectorAll('[data-setting-row] > div:first-child p:first-child')).map(
      (p) => p.textContent,
    );
    expect(labels).toEqual(['Theme', 'Font', 'Text size', 'High contrast']);
    expect(dialog().querySelector('section')).toBe(appearance);
  });

  it('theme is an icon segmented control with accessible names, and applies in the same click', () => {
    renderAt('/?settings=general');
    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    const names = within(theme)
      .getAllByRole('radio')
      .map((r) => r.getAttribute('aria-label'));
    expect(names).toEqual(['System', 'Light', 'Dark']);
    expect(within(theme).getByRole('radio', { name: 'System' })).toBeChecked();

    fireEvent.click(within(theme).getByRole('radio', { name: 'Light' }));
    expect(within(theme).getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(getPrefs().theme).toBe('light');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.style.colorScheme).toBe('light');

    fireEvent.click(within(theme).getByRole('radio', { name: 'Dark' }));
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.style.colorScheme).toBe('dark');

    fireEvent.click(within(theme).getByRole('radio', { name: 'System' }));
    expect(getPrefs().theme).toBe('system');
  });

  it('text size and contrast set their document attributes', () => {
    renderAt('/?settings=general');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Text size' })).getByRole('radio', { name: 'Large' }),
    );
    expect(root).toHaveAttribute('data-text-size', 'large');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Text size' })).getByRole('radio', { name: 'Small' }),
    );
    expect(root).toHaveAttribute('data-text-size', 'small');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Text size' })).getByRole('radio', { name: 'Medium' }),
    );
    expect(root).not.toHaveAttribute('data-text-size');

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'High contrast' })).getByRole('radio', { name: 'On' }),
    );
    expect(root).toHaveAttribute('data-contrast', 'more');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'High contrast' })).getByRole('radio', { name: 'Off' }),
    );
    expect(root).not.toHaveAttribute('data-contrast');
  });

  it('font is a select with the four typefaces and applies the choice', () => {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture ??= () => false;
    proto.releasePointerCapture ??= () => {};
    proto.scrollIntoView ??= () => {};
    renderAt('/?settings=general');
    const trigger = screen.getByRole('combobox', { name: 'Font' });
    expect(trigger).toHaveTextContent('Inter Tight (default)');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Inter Tight (default)',
      'System',
      'Atkinson Hyperlegible',
      'JetBrains Mono',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Atkinson Hyperlegible' }));
    expect(getPrefs().font).toBe('atkinson');
    expect(root).toHaveAttribute('data-font', 'atkinson');
  });

  it('is found by search keywords', () => {
    renderAt('/?settings=display');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dyslexia' } });
    expect(screen.getByRole('combobox', { name: 'Font' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'frosted' } });
    expect(screen.queryByRole('radiogroup', { name: 'Reduce transparency' })).toBeNull();
  });
});

describe('no layout shift', () => {
  it('the desktop box is a fixed size that no section, search or pref can change', () => {
    renderAt('/?settings=general');
    const box = dialog();
    expect(box.className).toContain('md:h-[min(44rem,90dvh)]');
    expect(box.className).toContain('md:w-[min(60rem,calc(100vw-2rem))]');
    const before = box.className;
    const style = box.getAttribute('style');

    for (const name of ['Display', 'Account', 'Developers', 'General']) {
      fireEvent.click(within(nav()).getByRole('link', { name }));
      expect(dialog()).toBe(box);
      expect(box.className).toBe(before);
      expect(box.getAttribute('style')).toBe(style);
    }

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'font' } });
    expect(box.className).toBe(before);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });

    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    fireEvent.click(within(theme).getByRole('radio', { name: 'Dark' }));
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Text size' })).getByRole('radio', { name: 'Large' }),
    );
    expect(dialog()).toBe(box);
    expect(box.className).toBe(before);
    expect(box.getAttribute('style')).toBe(style);
  });

  it('both columns reserve their scrollbar so content never reflows between sections', () => {
    renderAt('/?settings=general');
    const scrollers = Array.from(dialog().querySelectorAll<HTMLElement>('[class*="overflow-y-auto"]'));
    expect(scrollers.length).toBeGreaterThanOrEqual(2);
    for (const el of scrollers) expect(el.className).toContain('[scrollbar-gutter:stable]');
  });

  it('a nav row keeps the same classes whether or not it is the active one', () => {
    renderAt('/?settings=general');
    const link = within(nav()).getByRole('link', { name: 'Display' });
    const idle = link.className;
    expect(idle).not.toMatch(/font-(medium|semibold|bold)/);
    fireEvent.click(link);
    const active = within(nav()).getByRole('link', { name: 'Display' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toBe(idle);
  });

  it('switching sections is synchronous: the new section and its active row are there after the click', () => {
    renderAt('/?settings=general');
    fireEvent.click(within(nav()).getByRole('link', { name: 'Developers' }));
    expect(within(nav()).getByRole('link', { name: 'Developers' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav()).getByRole('link', { name: 'General' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('dialog', { name: 'Developers' })).toBeInTheDocument();
  });

  it('desktop sections swap with no fade or slide', () => {
    renderAt('/?settings=general');
    fireEvent.click(within(nav()).getByRole('link', { name: 'Account' }));
    expect(dialog().querySelector('[data-pane-view]')).not.toHaveAttribute('data-dir');
  });

  it('a segmented control has no sliding indicator and every option keeps its width', () => {
    renderAt('/?settings=general');
    expect(dialog().querySelector('[data-segment-indicator]')).toBeNull();
    const group = screen.getByRole('radiogroup', { name: 'Motion' });
    const before = within(group)
      .getAllByRole('radio')
      .map((r) => r.className);
    fireEvent.click(within(group).getByRole('radio', { name: 'Reduced' }));
    const after = within(screen.getByRole('radiogroup', { name: 'Motion' }))
      .getAllByRole('radio')
      .map((r) => r.className);
    expect(after).toEqual(before);
  });

  it('density, motion and appearance prefs do not remount the dialog contents', () => {
    renderAt('/?settings=general');
    const row = screen.getByRole('radiogroup', { name: 'Table density' });
    fireEvent.click(within(row).getByRole('radio', { name: 'Compact' }));
    expect(screen.getByRole('radiogroup', { name: 'Table density' })).toBe(row);
    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    fireEvent.click(within(theme).getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBe(theme);
  });
});
