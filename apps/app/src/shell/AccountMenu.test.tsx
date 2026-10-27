import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { FakeXhr, makeImage, pngFile, stubObjectUrls } from '@/features/media/test-support';
import { predictKeys } from '@/features/predict/queries';
import { FakeApi } from '@/features/predict/test-support';
import { SessionContext } from '@/features/session/session-context';
import { DOCS_URL } from '@/lib/env';
import { AccountMenu } from './AccountMenu';

const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const session = { authenticated: true, userId: 'u1', address: ADDRESS, expiresAt: '2026-11-11T12:00:00Z' } as const;
const signOut = { run: vi.fn(), pending: false, failed: false };

function renderMenu(rail = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/portfolio']}>
        <Tooltip.Provider>
          <ToastProvider>
            <SessionContext value={{ session, signOut }}>
              <AccountMenu rail={rail} />
            </SessionContext>
          </ToastProvider>
        </Tooltip.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

const open = () => fireEvent.keyDown(screen.getByRole('button', { name: /9WzD…AWWM/ }), { key: 'Enter' });

beforeEach(() => {
  new FakeApi({ markets: [], balance: 1234 }).install();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AccountMenu', () => {
  it('trigger shows the short address and the practice balance', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /9WzD…AWWM/ });
    expect(trigger).toHaveTextContent('9WzD…AWWM');
    await waitFor(() => expect(trigger).toHaveTextContent('1,234'));
  });

  it('lists every destination in order with working hrefs', async () => {
    renderMenu();
    open();
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent?.replace(/\s*\(opens in a new tab\)/, ''))).toEqual([
      'Portfolio',
      'Leaderboard',
      'Change avatar',
      'Copy address',
      'View on Solscan',
      'Settings',
      'Docs',
      'Sign out',
    ]);
    expect(screen.getByRole('menuitem', { name: /Portfolio/ })).toHaveAttribute('href', '/portfolio');
    expect(screen.getByRole('menuitem', { name: /Leaderboard/ })).toHaveAttribute('href', '/leaderboard');
    expect(screen.getByRole('menuitem', { name: /Settings/ })).toHaveAttribute('href', '/portfolio?settings=general');
    const solscan = screen.getByRole('menuitem', { name: /View on Solscan/ });
    expect(solscan).toHaveAttribute('href', `https://solscan.io/account/${ADDRESS}`);
    expect(solscan).toHaveAttribute('target', '_blank');
    expect(solscan).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByRole('menuitem', { name: /Docs/ })).toHaveAttribute('href', DOCS_URL);
  });

  it('header carries the Solana badge and the practice balance', async () => {
    renderMenu();
    open();
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('img', { name: 'Solana' }).length).toBeGreaterThan(0);
    expect(within(menu).getByText('Balance')).toBeInTheDocument();
    await waitFor(() => expect(menu).toHaveTextContent('1,234'));
  });

  it('copy writes the full address, swaps the icon label and raises a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderMenu();
    open();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy address' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS));
    expect(await screen.findByRole('menuitem', { name: 'Address copied' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Address copied'));
  });

  describe('avatar', () => {
    const image = makeImage(21);
    let fake: FakeApi;
    const triggerPicture = () =>
      screen
        .getByRole('button', { name: /9WzD…AWWM/ })
        .querySelector<HTMLImageElement>('[data-smart-image] img:not([data-placeholder])');

    beforeEach(() => {
      const entry = {
        rank: 1,
        address: ADDRESS,
        netWorthPts: 1500,
        balancePts: 1500,
        openValuePts: 0,
        pnlPts: 500,
        marketsTraded: 2,
      };
      fake = new FakeApi({ markets: [], leaderboard: { entries: [entry], me: entry } });
      fake.sessionAddress = ADDRESS;
      fake.images.set(image.id, image);
      fake.install();
      FakeXhr.install();
      stubObjectUrls();
    });

    it('shows the wallet gradient until there is a picture, and no Remove row', async () => {
      renderMenu();
      open();
      await screen.findByRole('menu');
      expect(document.querySelector('[data-wallet-avatar]')).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Remove avatar' })).not.toBeInTheDocument();
    });

    it('uploads in the dialog, saves it, and updates the trigger, me and the leaderboard', async () => {
      const { client } = renderMenu();
      open();
      await waitFor(() => expect(screen.getByRole('menu')).toHaveTextContent('#1'));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change avatar' }));
      const dialog = await screen.findByRole('dialog', { name: 'Change avatar' });
      const save = within(dialog).getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();

      fireEvent.change(within(dialog).getByLabelText('Choose an image file'), { target: { files: [pngFile()] } });
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
      expect(FakeXhr.last.url).toContain('/v1/media?kind=avatar');
      expect(save).toBeDisabled();
      act(() => FakeXhr.last.respond(201, { image, created: true }));
      await waitFor(() => expect(save).toBeEnabled());
      fireEvent.click(save);

      await waitFor(() => expect(fake.callsTo('PUT', '/v1/me/avatar')).toHaveLength(1));
      expect(fake.callsTo('PUT', '/v1/me/avatar')[0]?.body).toEqual({ mediaId: image.id });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByText('Avatar updated')).toBeInTheDocument();

      await waitFor(() => expect(triggerPicture()).toHaveAttribute('src', image.urls.avatar64));
      expect(client.getQueryData<{ avatar: unknown }>(['me'])?.avatar).toEqual(image);
      const board = client.getQueryData<{
        entries: { address: string; avatar?: unknown }[];
        me: { avatar?: unknown } | null;
      }>(predictKeys.leaderboard);
      expect(board?.entries.find((e) => e.address === ADDRESS)?.avatar).toEqual(image);
      expect(board?.me?.avatar).toEqual(image);
    });

    it('removes the avatar from the menu and clears the caches', async () => {
      fake.avatar = image;
      const { client } = renderMenu();
      await waitFor(() => expect(triggerPicture()).toHaveAttribute('src', image.urls.avatar64));
      open();
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove avatar' }));
      await waitFor(() => expect(fake.callsTo('PUT', '/v1/me/avatar')[0]?.body).toEqual({ mediaId: null }));
      expect(await screen.findByText('Avatar removed')).toBeInTheDocument();
      await waitFor(() => expect(triggerPicture()).toBeNull());
      expect(document.querySelector('[data-wallet-avatar]')).toBeInTheDocument();
      expect(client.getQueryData<{ avatar: unknown }>(['me'])?.avatar).toBeNull();
    });

    it('removes the current avatar from inside the dialog on Save', async () => {
      fake.avatar = image;
      renderMenu();
      await waitFor(() => expect(triggerPicture()).not.toBeNull());
      open();
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change avatar' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Remove' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove avatar' }));
      await waitFor(() => expect(fake.callsTo('PUT', '/v1/me/avatar')[0]?.body).toEqual({ mediaId: null }));
    });

    it('says why saving failed and keeps the dialog open', async () => {
      fake.override = (path, init) =>
        path === '/v1/me/avatar' && init?.method === 'PUT'
          ? new Response(JSON.stringify({ error: { code: 'media_removed', message: 'gone' } }), { status: 410 })
          : undefined;
      renderMenu();
      open();
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change avatar' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Choose an image file'), { target: { files: [pngFile()] } });
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
      act(() => FakeXhr.last.respond(201, { image, created: true }));
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await waitFor(() => expect(save).toBeEnabled());
      fireEvent.click(save);
      expect(await within(dialog).findByText(/removed by moderators/)).toBeInTheDocument();
    });
  });

  it('sign out runs the logout flow', async () => {
    renderMenu();
    open();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(signOut.run).toHaveBeenCalled();
  });

  it('collapsed: avatar only, labelled button, menu still opens', async () => {
    renderMenu(true);
    const trigger = screen.getByRole('button', { name: 'Account menu, 9WzD…AWWM' });
    expect(trigger).not.toHaveTextContent('9WzD');
    open();
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });
});
