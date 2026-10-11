import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Wallet } from '@wallet-standard/base';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/providers';
import { routes } from '@/routes';
import { ADDRESS, fakeWallet, json, nonceBody, verifyBody } from '@/test/fake-wallet';

const mocks = vi.hoisted(() => ({ wallets: [] as readonly Wallet[], redirectTo: vi.fn() }));

vi.mock('@/wallets/use-sign-in-wallets', () => ({ useSignInWallets: () => mocks.wallets }));
vi.mock('@/lib/navigate', () => ({ redirectTo: mocks.redirectTo }));

const anonymous = { authenticated: false };

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function stubApi(handler: Handler) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    return handler(path, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const happyApi: Handler = (path) => {
  if (path === '/v1/auth/session') return json(anonymous);
  if (path === '/v1/auth/siws/nonce') return json(nonceBody);
  if (path === '/v1/auth/siws/verify') return json(verifyBody);
  return json({ error: { code: 'not_found', message: 'nope' } }, 404);
};

function renderAt(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

beforeEach(() => {
  mocks.wallets = [];
  mocks.redirectTo.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('sign-in screen', () => {
  it('without a wallet: heading, three install buttons, one muted hint, tiny legal line', async () => {
    stubApi(happyApi);
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Keep')).toBeInTheDocument();
    expect(screen.getByTestId('mark-poster')).toBeInTheDocument();
    expect(screen.queryByText('Example data')).toBeNull();
    expect(screen.getByRole('button', { name: 'What am I signing?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /windle\.fun/ })).toHaveAttribute('href');
    expect(await screen.findByText('Installed? Unlock it and reload.')).toBeInTheDocument();
    for (const name of ['Phantom', 'Backpack', 'Solflare']) {
      expect(screen.getByRole('link', { name: new RegExp(`Install ${name}`) })).toHaveAttribute('href');
    }
    expect(screen.queryByText(/coming soon/)).toBeNull();
    expect(screen.queryByRole('button', { name: /email|with x$/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', 'https://docs.windle.fun/legal/terms/');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      'https://docs.windle.fun/legal/privacy/',
    );
  });

  it('social providers: disabled ones are inert "Soon" pills, no email or X', async () => {
    stubApi((path) =>
      path === '/v1/auth/providers'
        ? json({
            providers: ['siws', 'email', 'x', 'google', 'telegram', 'discord'].map((id) => ({
              id,
              enabled: id === 'siws',
            })),
          })
        : happyApi(path),
    );
    renderAt('/');
    for (const name of ['Google', 'Telegram', 'Discord']) {
      const pill = await screen.findByRole('button', { name: `Sign in with ${name} — coming soon` });
      expect(pill).toBeDisabled();
    }
    expect(screen.getAllByText('Soon')).toHaveLength(3);
    expect(screen.queryByText(/email/i)).toBeNull();
  });

  it('social providers: an enabled one becomes a link to the api start route', async () => {
    stubApi((path) =>
      path === '/v1/auth/providers'
        ? json({
            providers: ['siws', 'google', 'telegram', 'discord'].map((id) => ({
              id,
              enabled: id === 'siws' || id === 'discord',
            })),
          })
        : happyApi(path),
    );
    renderAt('/?return_to=https%3A%2F%2Fapp.windle.fun%2Fpromises');
    const link = await screen.findByRole('link', { name: 'Sign in with Discord' });
    const href = new URL(link.getAttribute('href') ?? '');
    expect(href.pathname).toBe('/v1/auth/discord/start');
    expect(href.searchParams.get('return_to')).toBe('https://app.windle.fun/promises');
    expect(screen.getByRole('button', { name: 'Sign in with Google — coming soon' })).toBeDisabled();
  });

  it('shows an allow-listed return_to and ignores a foreign one', async () => {
    stubApi(happyApi);
    const { unmount } = renderAt('/?return_to=https%3A%2F%2Fapp.windle.fun%2Fpromises');
    expect(await screen.findByText('Returns to app.windle.fun')).toHaveClass('sr-only');
    unmount();
    renderAt('/?return_to=https%3A%2F%2Fevil.example%2F');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/Returns to/)).toBeNull();
  });

  it('signs in with a wallet, then redirects to return_to', async () => {
    const fetchMock = stubApi(happyApi);
    const { wallet } = fakeWallet('Phantom');
    mocks.wallets = [wallet];
    renderAt('/?return_to=https%3A%2F%2Fapp.windle.fun%2Fpromises');

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Phantom' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'You’re in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Signed in as 9WzD…AWWM. Redirecting.');
    const verify = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/v1/auth/siws/verify'));
    expect(verify?.[1]?.credentials).toBe('include');
    await waitFor(() => expect(mocks.redirectTo).toHaveBeenCalledWith('https://app.windle.fun/promises'), {
      timeout: 3000,
    });
  });

  it('falls back to the app when there is no return_to', async () => {
    stubApi(happyApi);
    mocks.wallets = [fakeWallet().wallet];
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Phantom' }));
    await waitFor(() => expect(mocks.redirectTo).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mocks.redirectTo.mock.calls[0]?.[0]).toMatch(/^https?:\/\/(localhost:5174|app\.windle\.fun)/);
  });

  it('pressed button shows the wallet prompt; announced politely', async () => {
    stubApi(happyApi);
    const { wallet } = fakeWallet('Phantom', () => new Promise(() => {}));
    mocks.wallets = [wallet];
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Phantom' }));
    expect(await screen.findByText('Check your wallet…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Confirm the sign-in request in Phantom.');
  });

  it('rejection: one muted line, buttons stay usable', async () => {
    stubApi(happyApi);
    let calls = 0;
    const { wallet } = fakeWallet('Phantom', async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
      return { signedMessage: new TextEncoder().encode('m'), signature: new Uint8Array(64).fill(3) };
    });
    mocks.wallets = [wallet];
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Phantom' }));
    expect(await screen.findByText('Signature rejected.')).toBeInTheDocument();
    expect(mocks.redirectTo).not.toHaveBeenCalled();

    expect(await screen.findByRole('button', { name: 'Sign in with Phantom' })).toBeInTheDocument();
  });

  it('shows an actionable message when the api is unreachable', async () => {
    stubApi((path) => {
      if (path === '/v1/auth/session') return json(anonymous);
      throw new TypeError('Failed to fetch');
    });
    mocks.wallets = [fakeWallet().wallet];
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Phantom' }));
    expect(await screen.findByText('Couldn’t reach windle. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Phantom' })).toBeEnabled();
  });

  it('opens the SIWS preview in a dialog', async () => {
    stubApi(happyApi);
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'What am I signing?' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('wants you to sign in with your Solana account');
  });

  it('already signed in: shows the account, continues to the app, signs out', async () => {
    let loggedOut = false;
    stubApi((path) => {
      if (path === '/v1/auth/session') return json(loggedOut ? anonymous : verifyBody.session);
      if (path === '/v1/auth/logout') {
        loggedOut = true;
        return new Response(null, { status: 204 });
      }
      return json({}, 404);
    });
    mocks.wallets = [fakeWallet().wallet];
    renderAt('/?return_to=https%3A%2F%2Fapp.windle.fun%2F');

    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText(`${ADDRESS.slice(0, 6)}…${ADDRESS.slice(-6)}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Continue to app/ })).toHaveAttribute('href', 'https://app.windle.fun/');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in with Phantom' })).toBeInTheDocument();
    expect(loggedOut).toBe(true);
  });
});
