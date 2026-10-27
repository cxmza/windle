import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '@/features/session/session-context';
import { API_URL, DOCS_URL } from '@/lib/env';
import { getPrefs, reloadPrefs } from './prefs';
import { SettingsDialog } from './SettingsDialog';

const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const USER_ID = '4f7f4a0e-6a58-4d8c-9d63-0a8a9a2f6a11';

const session = {
  session: { authenticated: true as const, userId: USER_ID, address: ADDRESS, expiresAt: '2026-11-11T12:00:00Z' },
  signOut: { run: vi.fn(), pending: false, failed: false },
};

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>;
}

const where = () => screen.getByTestId('where').textContent;

const originalMatchMedia = window.matchMedia;

function stubViewport(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width') ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderAt(url: string, wide = true) {
  stubViewport(wide);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext value={session}>
        <MemoryRouter initialEntries={[url]}>
          <SettingsDialog />
          <Where />
        </MemoryRouter>
      </SessionContext>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  reloadPrefs();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        id: USER_ID,
        createdAt: '2026-10-11T12:00:00Z',
        wallets: [{ chain: 'solana', address: ADDRESS, linkedAt: '2026-10-11T12:00:00Z' }],
      }),
    ),
  );
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
});

describe('url-driven dialog', () => {
  it('is closed without the settings param', () => {
    renderAt('/projects?q=ember');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on ?settings=<section> with that section as its title', () => {
    renderAt('/?settings=display');
    expect(screen.getByRole('dialog', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Countdown' })).toBeInTheDocument();
  });

  it('opens General for an unknown section', () => {
    renderAt('/?settings=nonsense');
    expect(screen.getByRole('dialog', { name: 'General' })).toBeInTheDocument();
  });

  it('switching sections replaces the param and keeps other params', () => {
    renderAt('/projects?q=ember&settings=general');
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Developers' }));
    expect(where()).toBe('/projects?q=ember&settings=developers');
    expect(screen.getByRole('dialog', { name: 'Developers' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Developers' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes with the X button, removing only the settings param', async () => {
    renderAt('/projects?q=ember&settings=general');
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/projects?q=ember');
  });

  it('closes with Escape', async () => {
    renderAt('/?m=x&settings=account');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/?m=x');
  });

  it('closes on a click outside the dialog', async () => {
    renderAt('/?settings=general');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const overlay = document.querySelector('[data-state=open].bg-scrim');
    if (!overlay) throw new Error('overlay not found');
    fireEvent.pointerDown(overlay);
    fireEvent.pointerUp(overlay);
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/');
  });
});

describe('rows', () => {
  it('a segmented control changes the stored preference', () => {
    renderAt('/?settings=general');
    const motion = screen.getByRole('radiogroup', { name: 'Motion' });
    expect(within(motion).getByRole('radio', { name: 'Match system' })).toBeChecked();
    fireEvent.click(within(motion).getByRole('radio', { name: 'Reduced' }));
    expect(getPrefs().motion).toBe('reduced');
    expect(within(motion).getByRole('radio', { name: 'Reduced' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced');
    expect(JSON.parse(window.localStorage.getItem('windle.prefs.v1') ?? '{}')).toMatchObject({ motion: 'reduced' });
  });

  it('a select changes the odds format', () => {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture ??= () => false;
    proto.releasePointerCapture ??= () => {};
    proto.scrollIntoView ??= () => {};
    renderAt('/?settings=display');
    const trigger = screen.getByRole('combobox', { name: 'Odds format' });
    expect(trigger).toHaveTextContent('Percent (62%)');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Decimal odds (1.61)' }));
    expect(getPrefs().odds).toBe('decimal');
    expect(screen.getByRole('combobox', { name: 'Odds format' })).toHaveTextContent('Decimal odds (1.61)');
  });

  it('keeps the USD row honestly unavailable', () => {
    renderAt('/?settings=display');
    expect(screen.getByText('Needs a price feed — not available yet')).toBeInTheDocument();
    expect(screen.getByText('Unavailable').closest('[aria-disabled=true]')).not.toBeNull();
  });

  it('account rows show wallets from the api and the session', async () => {
    renderAt('/?settings=account');
    expect(await screen.findByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(/· this session/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('developer rows: external docs link, copyable API url, honest API keys state', () => {
    renderAt('/?settings=developers');
    const link = screen.getByRole('link', { name: /Open docs/ });
    expect(link).toHaveAttribute('href', DOCS_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(API_URL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy API base URL' })).toBeInTheDocument();
    expect(screen.getByText('Not available yet')).toBeInTheDocument();
  });
});

describe('search', () => {
  const search = (text: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } });

  it('filters rows across all sections by label and groups them by section', () => {
    renderAt('/?settings=general');
    search('odds');
    const dialog = screen.getByRole('dialog', { name: 'Search results' });
    expect(within(dialog).getByRole('region', { name: 'Display' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Odds format' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radiogroup', { name: 'Motion' })).toBeNull();
  });

  it('matches descriptions and keywords', () => {
    renderAt('/?settings=general');
    search('compact');
    expect(screen.getByRole('radiogroup', { name: 'Table density' })).toBeInTheDocument();
    search('log out');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Table density' })).toBeNull();
  });

  it('shows an empty state and clears back to the section', () => {
    renderAt('/?settings=general');
    search('zzzz');
    expect(screen.getByRole('status')).toHaveTextContent('No settings match “zzzz”.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('dialog', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Motion' })).toBeInTheDocument();
  });
});

describe('mobile layout', () => {
  it('lists sections first, opens one with a back button, and goes back', () => {
    renderAt('/?settings=general', false);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Motion' })).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Display' }));
    expect(screen.getByRole('dialog', { name: 'Display' })).toBeInTheDocument();
    expect(where()).toBe('/?settings=display');

    fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
  });

  it('opens straight into a deep-linked section', () => {
    renderAt('/?settings=account', false);
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to settings' })).toBeInTheDocument();
  });

  it('keeps the search input mounted and focused while typing, and clears it from the keyboard', () => {
    renderAt('/?settings=general', false);
    const input = screen.getByRole('searchbox');
    input.focus();
    fireEvent.change(input, { target: { value: 'o' } });
    expect(screen.getByRole('dialog', { name: 'Search results' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBe(input);
    expect(input.isConnected).toBe(true);
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'od' } });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBe(input);
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
  });
});

describe('initial focus', () => {
  it('desktop open focuses the active section, not the search field', () => {
    renderAt('/?settings=display');
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('link', { name: 'Display' })).toHaveFocus();
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });
});
