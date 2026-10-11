import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_URL } from '@/lib/env';
import { routes } from '@/routes';

const mocks = vi.hoisted(() => ({ redirectTo: vi.fn() }));
vi.mock('@/lib/navigate', () => ({ redirectTo: mocks.redirectTo }));

const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const USER_ID = '4f7f4a0e-6a58-4d8c-9d63-0a8a9a2f6a11';

const authed = { authenticated: true, userId: USER_ID, address: ADDRESS, expiresAt: '2026-11-11T12:00:00Z' };
const me = {
  id: USER_ID,
  createdAt: '2026-10-11T12:00:00Z',
  wallets: [{ chain: 'solana', address: ADDRESS, linkedAt: '2026-10-11T12:00:00Z' }],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function stubApi(handler: Handler) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(url)).pathname, init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const signedIn: Handler = (path) => {
  if (path === '/v1/auth/session') return json(authed);
  if (path === '/v1/me') return json(me);
  if (path === '/v1/auth/logout') return new Response(null, { status: 204 });
  return json({ error: { code: 'not_found', message: 'nope' } }, 404);
};

/** The app header (pages also use <header>, so "banner" is not unique). */
const shellHeader = () => screen.getAllByRole('banner')[0] as HTMLElement;

function renderAt(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => mocks.redirectTo.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('session gate', () => {
  it('renders the shell with a placeholder while the session loads, then the page', async () => {
    let release: (r: Response) => void = () => {};
    stubApi((path) => (path === '/v1/auth/session' ? new Promise<Response>((r) => (release = r)) : signedIn(path)));
    renderAt('/dashboard');

    // first test of the file pays for cold module loading
    expect(await screen.findByRole('status', {}, { timeout: 5000 })).toHaveTextContent('Checking your session');
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

    release(json(authed));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, { timeout: 5000 })).toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { level: 1, name: 'Dashboard' })).toBeNull();
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('shows a friendly banner with a dev notice when the api is down, and recovers on retry', async () => {
    let up = false;
    stubApi((path) => {
      if (!up) throw new TypeError('Failed to fetch');
      return signedIn(path);
    });
    renderAt('/dashboard');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Can’t reach windle');
    expect(alert).toHaveTextContent('Dev notice');
    expect(mocks.redirectTo).not.toHaveBeenCalled();

    up = true;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('treats a response that breaks the contract as an api problem, not as anonymous', async () => {
    stubApi(() => json({ authenticated: 'maybe' }));
    renderAt('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected answer');
    expect(mocks.redirectTo).not.toHaveBeenCalled();
  });
});

describe('shell and pages', () => {
  it('header shows the shortened wallet address and copies the full one', async () => {
    stubApi(signedIn);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt('/dashboard');

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const banner = shellHeader();
    expect(within(banner).getByText('9WzD…AWWM')).toBeInTheDocument();
    fireEvent.click(within(banner).getByRole('button', { name: 'Copy wallet address' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS));
    expect(await within(banner).findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('dashboard: honest empty state, disabled call to action, no invented data', async () => {
    stubApi(signedIn);
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { level: 2, name: 'Your promises' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Make a promise/ })).toBeDisabled();
  });

  it('navigates between Promises, Markets and Account (aria-current follows)', async () => {
    stubApi(signedIn);
    renderAt('/dashboard');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    fireEvent.click(screen.getAllByRole('link', { name: 'Promises' })[0] as HTMLElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'Promises' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Promises' })[0]).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getAllByRole('link', { name: 'Markets' })[0] as HTMLElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'markets' })).toBeInTheDocument();
  });

  it('account: lists wallets from /v1/me and session info', async () => {
    stubApi(signedIn);
    renderAt('/account');
    const wallets = await screen.findByRole('region', { name: 'Wallets' });
    expect(await within(wallets).findByText(ADDRESS)).toBeInTheDocument();
    expect(within(wallets).getByText(/this session/)).toBeInTheDocument();
    const session = screen.getByRole('region', { name: 'This session' });
    expect(within(session).getByText('Expires')).toBeInTheDocument();
  });

  it('account: /v1/me failing shows a retryable banner without taking the page down', async () => {
    stubApi((path) =>
      path === '/v1/me' ? json({ error: { code: 'internal', message: 'boom' } }, 503) : signedIn(path),
    );
    renderAt('/account');
    const wallets = await screen.findByRole('region', { name: 'Wallets' });
    expect(await within(wallets).findByRole('alert')).toHaveTextContent('windle is having trouble');
    expect(screen.getByRole('region', { name: 'This session' })).toBeInTheDocument();
  });

  it('sign out posts to the api, then leaves for the sign-in app', async () => {
    const fetchMock = stubApi(signedIn);
    renderAt('/account');
    await screen.findByRole('heading', { level: 1, name: 'Account' });

    fireEvent.click(
      within(screen.getByRole('region', { name: 'This session' })).getByRole('button', { name: 'Sign out' }),
    );
    await waitFor(() => expect(mocks.redirectTo).toHaveBeenCalledWith(AUTH_URL));
    const logout = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/v1/auth/logout'));
    expect(logout?.[1]?.method).toBe('POST');
    expect(logout?.[1]?.credentials).toBe('include');
  });

  it('sign out failure keeps the session and says so', async () => {
    stubApi((path) => (path === '/v1/auth/logout' ? json({}, 500) : signedIn(path)));
    renderAt('/account');
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    fireEvent.click(within(shellHeader()).getByRole('button', { name: 'Sign out' }));
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
  // jsdom has no WebGL: the home falls back to the list, which is also the accessible view of the scene
  it('"/" shows the markets list with its own chrome, sample data labelled', async () => {
    stubApi(signedIn);
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'markets' }, { timeout: 5000 })).toBeInTheDocument();
    const open = screen.getByRole('region', { name: /Open/ });
    expect(within(open).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('region', { name: /Settled/ })).toBeInTheDocument();
    expect(screen.getByText(/sample data/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scene' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Markets' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens a market from the list, Esc closes it and focus returns to the row', async () => {
    stubApi(signedIn);
    renderAt('/');
    const row = await screen.findByRole('button', { name: /KSTL/ }, { timeout: 5000 });
    fireEvent.click(row);
    const panel = await screen.findByRole('dialog', { name: /withdrawal queue/ });
    expect(within(panel).getByRole('button', { name: /^Ship/ })).toHaveTextContent('0.72');
    expect(within(panel).getByRole('button', { name: /^Slash/ })).toHaveTextContent('0.28');
    expect(within(panel).getByText(/init_queue/)).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByRole('heading', { level: 2 })).toHaveFocus());

    fireEvent.click(within(panel).getByRole('button', { name: /^Ship/ }));
    expect(within(panel).getByRole('status')).toHaveTextContent('Trading is not live yet');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: /KSTL/ })).toHaveFocus());
  });

  it('arrow keys move between rows', async () => {
    stubApi(signedIn);
    renderAt('/');
    const rows = await screen.findAllByRole('button', { name: /\$[A-Z]+/ }, { timeout: 5000 });
    const first = rows[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(rows[1]).toHaveFocus();
    // roving stays inside a section: End goes to the last open market, not into "Settled"
    fireEvent.keyDown(rows[1] as HTMLElement, { key: 'End' });
    expect(rows[9]).toHaveFocus();
  });

  it('the old /markets page redirects to the list view of the home', async () => {
    stubApi(signedIn);
    renderAt('/markets');
    expect(await screen.findByRole('heading', { level: 1, name: 'markets' }, { timeout: 5000 })).toBeInTheDocument();
  });
});
