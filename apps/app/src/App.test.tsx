import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApi, makeMarket } from '@/features/predict/test-support';
import { reloadPrefs } from '@/features/settings/prefs';
import { AUTH_URL } from '@/lib/env';
import { routes } from '@/routes';

// The first render of each route loads its lazy chunk; under a full parallel run that can exceed the default wait.
configure({ asyncUtilTimeout: 15_000 });

const mocks = vi.hoisted(() => ({ redirectTo: vi.fn() }));
vi.mock('@/lib/navigate', () => ({ redirectTo: mocks.redirectTo }));

const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const USER_ID = '4f7f4a0e-6a58-4d8c-9d63-0a8a9a2f6a11';

const authed = { authenticated: true, userId: USER_ID, address: ADDRESS, expiresAt: '2026-11-11T12:00:00Z' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Handler = (path: string, init?: RequestInit, url?: string) => Response | Promise<Response>;

let fake: FakeApi;

function stubApi(handler: Handler) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(url)).pathname, init, String(url)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const signedIn: Handler = (path, init, url) => fake.respond(url ?? `http://api.test${path}`, init);

const openAccountMenu = () => {
  fireEvent.keyDown(screen.getByRole('button', { name: /9WzD…AWWM/ }), { key: 'Enter' });
};

function renderAt(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  mocks.redirectTo.mockReset();
  window.localStorage.clear();
  reloadPrefs();
  fake = new FakeApi({
    markets: [
      makeMarket({ slug: 'sprout-staking', statement: 'Sprout ships staking v2' }),
      makeMarket({
        slug: 'kestrel-vaults',
        statement: 'Kestrel opens vaults',
        project: { slug: 'kestrel', name: 'Kestrel', ticker: 'KSTL' },
      }),
      makeMarket({ slug: 'old-news', statement: 'An old promise', status: 'closed', tradable: false }),
    ],
  });
  fake.sessionAddress = ADDRESS;
});
afterEach(() => vi.unstubAllGlobals());

describe('session gate', () => {
  it('renders the shell with a placeholder while the session loads, then the page', async () => {
    let release: (r: Response) => void = () => {};
    stubApi((path) => (path === '/v1/auth/session' ? new Promise<Response>((r) => (release = r)) : signedIn(path)));
    renderAt('/portfolio');

    // first test of the file pays for cold module loading
    expect(await screen.findByRole('status', {}, { timeout: 5000 })).toHaveTextContent('Checking your session');
    expect(screen.getAllByRole('link', { name: 'Portfolio' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

    release(json(authed));
    expect(await screen.findByRole('heading', { level: 1, name: 'Portfolio' }, { timeout: 5000 })).toBeInTheDocument();
    expect(mocks.redirectTo).not.toHaveBeenCalled();
    // the inner waits allow 5 s each for cold module loading; the test itself needs room for both
  }, 15_000);

  it('sends an anonymous visitor to the sign-in app with return_to set to the current url', async () => {
    const fetchMock = stubApi((path) => json(path === '/v1/auth/session' ? { authenticated: false } : {}));
    renderAt('/');

    // "/" is a lazy route: the router resolves its module (cold in a fresh worker) before the gate renders
    await waitFor(() => expect(mocks.redirectTo).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const target = new URL(String(mocks.redirectTo.mock.calls[0]?.[0]));
    expect(`${target.origin}`).toBe(new URL(AUTH_URL).origin);
    expect(target.searchParams.get('return_to')).toBe(window.location.href);
    expect(screen.queryByRole('heading', { level: 1, name: 'Portfolio' })).toBeNull();
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('shows a friendly banner with a dev notice when the api is down, and recovers on retry', async () => {
    let up = false;
    stubApi((path) => {
      if (!up) throw new TypeError('Failed to fetch');
      return signedIn(path);
    });
    renderAt('/portfolio');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Can’t reach windle');
    expect(alert).toHaveTextContent('Dev notice');
    expect(mocks.redirectTo).not.toHaveBeenCalled();

    up = true;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Portfolio' })).toBeInTheDocument();
  });

  it('treats a response that breaks the contract as an api problem, not as anonymous', async () => {
    stubApi(() => json({ authenticated: 'maybe' }));
    renderAt('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected answer');
    expect(mocks.redirectTo).not.toHaveBeenCalled();
  });
});

describe('shell and pages', () => {
  it('sidebar account menu shows the shortened wallet address and copies the full one', async () => {
    stubApi(signedIn);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt('/portfolio');

    await screen.findByRole('heading', { level: 1, name: 'Portfolio' });
    openAccountMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy address' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS));
    expect(await screen.findByRole('menuitem', { name: 'Address copied' })).toBeInTheDocument();
  });

  it('portfolio: starts with the practice balance and an empty state that points to markets and create', async () => {
    stubApi(signedIn);
    renderAt('/portfolio');
    expect(await screen.findByRole('heading', { level: 2, name: 'No positions yet' })).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getAllByText(/1,000/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link', { name: 'Create a market' })[0]).toHaveAttribute('href', '/create');
  });

  it('the old /dashboard and /promises pages redirect to /portfolio and /create', async () => {
    stubApi(signedIn);
    const first = renderAt('/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: 'Portfolio' }, { timeout: 5000 })).toBeInTheDocument();
    expect(first.state.location.pathname).toBe('/portfolio');
    cleanup();

    const second = renderAt('/promises');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create a market' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(second.state.location.pathname).toBe('/create');
  });

  it('navigates between Portfolio, Create and Markets (aria-current follows)', async () => {
    stubApi(signedIn);
    await import('@/features/markets/MarketsHome');
    renderAt('/portfolio');
    await screen.findByRole('heading', { level: 1, name: 'Portfolio' }, { timeout: 5000 });
    expect(screen.getAllByRole('link', { name: 'Portfolio' })[0]).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getAllByRole('link', { name: 'Create' })[0] as HTMLElement);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create a market' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create' })[0]).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getAllByRole('link', { name: 'Markets' })[0] as HTMLElement);
    // Measured: the whole test takes ~2.6 s alone; with every test file running in parallel the first render of the
    // markets page alone passes 5 s, and the router shows the old page until it is ready.
    expect(await screen.findByRole('heading', { level: 1, name: 'Markets' }, { timeout: 20_000 })).toBeInTheDocument();
  }, 40_000);

  it('/account redirects to the account section of the settings dialog', async () => {
    stubApi(signedIn);
    const router = renderAt('/account');
    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?settings=account');
    expect(await within(dialog).findByText(ADDRESS)).toBeInTheDocument();
    expect(within(dialog).getByText(/· this session/)).toBeInTheDocument();
    expect(within(dialog).getByText('Session expires')).toBeInTheDocument();
  });

  it('account: /v1/me failing shows a retryable banner without taking the dialog down', async () => {
    stubApi((path) =>
      path === '/v1/me' ? json({ error: { code: 'internal', message: 'boom' } }, 503) : signedIn(path),
    );
    renderAt('/account');
    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('windle is having trouble');
    expect(within(dialog).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('settings open from the account menu on any route and close back to the same url', async () => {
    stubApi(signedIn);
    const router = renderAt('/portfolio?x=1');
    await screen.findByRole('heading', { level: 1, name: 'Portfolio' });
    openAccountMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    expect(router.state.location.search).toBe('?x=1&settings=general');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/portfolio');
    expect(router.state.location.search).toBe('?x=1');
  });

  it('sign out posts to the api, then leaves for the sign-in app', async () => {
    const fetchMock = stubApi(signedIn);
    renderAt('/account');
    const dialog = await screen.findByRole('dialog', { name: 'Account' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mocks.redirectTo).toHaveBeenCalledWith(AUTH_URL));
    const logout = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/v1/auth/logout'));
    expect(logout?.[1]?.method).toBe('POST');
    expect(logout?.[1]?.credentials).toBe('include');
  });

  it('sign out failure keeps the session and says so', async () => {
    stubApi((path) => (path === '/v1/auth/logout' ? json({}, 500) : signedIn(path)));
    renderAt('/portfolio');
    await screen.findByRole('heading', { level: 1, name: 'Portfolio' });
    openAccountMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(
      await screen.findByText('Could not sign out. Check your connection and try again.', { selector: '[role=alert]' }),
    ).toBeInTheDocument();
    expect(mocks.redirectTo).not.toHaveBeenCalled();
  });

  it('unknown paths render the 404 page inside the shell', async () => {
    stubApi(signedIn);
    renderAt('/nope/nothing');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to markets' })).toHaveAttribute('href', '/');
  });
});

describe('markets home', () => {
  it('"/" shows the market index from the api with its own chrome', async () => {
    stubApi(signedIn);
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Markets' }, { timeout: 5000 })).toBeInTheDocument();
    const list = await screen.findByRole('table', { name: 'Market list' });
    expect(within(list).getAllByRole('row')).toHaveLength(2 + 1);
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Community/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New market' })).toHaveAttribute('href', '/create');
    expect(screen.queryByRole('button', { name: 'Scene' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Markets' })).toHaveAttribute('aria-current', 'page');
  });

  it('a row opens the market page', async () => {
    stubApi(signedIn);
    renderAt('/');
    const list = await screen.findByRole('table', { name: 'Market list' }, { timeout: 5000 });
    const first = within(list).getAllByRole('link')[0] as HTMLElement;
    expect(first.getAttribute('href')).toMatch(/^\/m\/[a-z0-9-]+$/);
  });

  it('arrow keys move between rows', async () => {
    stubApi(signedIn);
    renderAt('/');
    const list = await screen.findByRole('table', { name: 'Market list' }, { timeout: 5000 });
    const rows = within(list).getAllByRole('link');
    const first = rows[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(rows[1] as HTMLElement, { key: 'End' });
    expect(rows[rows.length - 1]).toHaveFocus();
  });

  it('an old ?m=<id> link opens that market on its own page, and ?view= is ignored', async () => {
    stubApi(signedIn);
    const router = renderAt('/?view=list&m=kestrel-vaults');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kestrel opens vaults' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/m/kestrel-vaults');
  });

  it('the old /markets page redirects to the home', async () => {
    stubApi(signedIn);
    renderAt('/markets');
    expect(await screen.findByRole('heading', { level: 1, name: 'Markets' }, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('empty exchange', () => {
  it('a home with no markets says how markets start and offers the first step', async () => {
    fake = new FakeApi();
    stubApi(signedIn);
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'No open markets yet' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a market from a live post' })).toHaveAttribute('href', '/create');
    expect(screen.queryByRole('table', { name: 'Market list' })).toBeNull();
  });
});

describe('leaderboard and retired pages', () => {
  it('the sidebar links to the leaderboard, which opens inside the shell', async () => {
    fake.leaderboard = { ...fake.leaderboard, entries: [], rankedTraders: 0 };
    stubApi(signedIn);
    renderAt('/portfolio');
    await screen.findByRole('heading', { level: 1, name: 'Portfolio' }, { timeout: 5000 });
    fireEvent.click(screen.getAllByRole('link', { name: 'Leaderboard' })[0] as HTMLElement);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Leaderboard' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Leaderboard' })[0]).toHaveAttribute('aria-current', 'page');
  }, 20_000);

  it('the old /projects pages redirect to the markets home', async () => {
    stubApi(signedIn);
    const router = renderAt('/projects/kestrel-protocol');
    expect(await screen.findByRole('heading', { level: 1, name: 'Markets' }, { timeout: 10_000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  }, 20_000);
});
