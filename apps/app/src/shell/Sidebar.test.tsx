import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SOCIALS } from '@windle/brand';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApi, ISO, makeMarket } from '@/features/predict/test-support';
import { AppShell } from './AppShell';

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>;
}

function renderShell(url = '/portfolio') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AppShell>
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sidebar = () => screen.getByRole('complementary');

const HOUR = 3_600_000;
const soonest = Array.from({ length: 6 }, (_, i) =>
  makeMarket({
    slug: `ends-${i}`,
    statement: `Promise number ${i}`,
    project: { slug: `team-${i}`, name: `Team ${i}`, ticker: `TM${i}A` },
    deadline: ISO(Date.now() + (6 - i) * 5 * HOUR),
  }),
);
let fake: FakeApi;

beforeEach(() => {
  window.localStorage.clear();
  fake = new FakeApi({
    markets: [...soonest, makeMarket({ slug: 'closed-one', status: 'closed', tradable: false })],
  }).install();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sidebar', () => {
  it('lists the main destinations without Account, with aria-current on the active one', () => {
    renderShell('/create');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link', { name: /^(Markets|Portfolio|Leaderboard|Create)$/ })).toHaveLength(4);
    expect(within(nav).queryByRole('link', { name: 'Account' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Create' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Markets' })).not.toHaveAttribute('aria-current');
    expect(within(sidebar()).getByRole('link', { name: 'windle' })).toHaveAttribute('href', '/');
  });

  it('ending soon: the five open markets with the nearest deadlines, each linking to its page', async () => {
    renderShell();
    const list = await screen.findByRole('list', { name: 'Ending soon' });
    const links = within(list).getAllByRole('link');

    expect(links).toHaveLength(5);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      ['ends-5', 'ends-4', 'ends-3', 'ends-2', 'ends-1'].map((slug) => `/m/${slug}`),
    );
    expect(links[0]).toHaveTextContent('Team 5');
    expect(links[0]).toHaveTextContent(/\d\d:\d\d:\d\d/);
    expect(within(sidebar()).getByRole('link', { name: /All markets/ })).toHaveAttribute('href', '/');
    expect(fake.callsTo('GET', '/v1/markets')[0]?.query.get('status')).toBe('open');
  });

  it('ending soon: says so when nothing is open, and when the api fails', async () => {
    fake = new FakeApi().install();
    const first = renderShell();
    expect(await screen.findByText('No open markets right now.')).toBeInTheDocument();
    first.unmount();

    fake.failNext = new Response('{}', { status: 503 });
    renderShell();
    expect(await screen.findByText('Markets could not be loaded.')).toBeInTheDocument();
  });

  it('collapses to a rail, hides ending soon, and remembers the choice', async () => {
    const first = renderShell();
    await screen.findByRole('list', { name: 'Ending soon' });
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Ending soon' })).toBeNull();
    expect(within(sidebar()).getByRole('link', { name: 'Portfolio' })).toBeInTheDocument();
    expect(window.localStorage.getItem('windle.sidebar.collapsed')).toBe('1');
    expect(document.querySelector('[data-shell]')).toHaveAttribute('data-collapsed');

    first.unmount();
    renderShell();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('previews the token CA chip in dev via ?previewCa, full in the sidebar and as a copy button in the rail', () => {
    const mint = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    window.history.pushState({}, '', `/?previewCa=${mint}`);
    try {
      renderShell();
      const chip = () => sidebar().querySelector('[data-ca-chip]');
      expect(chip()).toHaveTextContent('7xKX…gAsU');
      expect(within(chip() as HTMLElement).getByRole('link', { name: /pump\.fun/ })).toHaveAttribute(
        'href',
        `https://pump.fun/coin/${mint}`,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
      expect(chip()).not.toHaveTextContent('7xKX…gAsU');
      expect(
        within(chip() as HTMLElement).getByRole('button', { name: `Copy contract address ${mint}` }),
      ).toBeInTheDocument();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('keeps the GitHub and X links in the sidebar, in the full layout and in the rail', () => {
    renderShell();
    const full = sidebar().querySelector('[data-sidebar-socials]');
    expect(full).not.toBeNull();
    expect(within(full as HTMLElement).getByRole('link', { name: /windle on GitHub/ })).toHaveAttribute(
      'href',
      SOCIALS.github,
    );
    expect(within(full as HTMLElement).getByRole('link', { name: /windle on X/ })).toHaveAttribute('href', SOCIALS.x);
    expect(sidebar().querySelector('[data-ca-chip]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const rail = sidebar().querySelector('[data-sidebar-socials]');
    expect(rail?.querySelector('a[data-social="github"]')).not.toBeNull();
    expect(rail?.querySelector('a[data-social="x"]')).not.toBeNull();
  });

  it('swaps to the rail when the panel slide ends, ignoring bubbled and unrelated transitions', () => {
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = real(el, pseudo);
      return el.hasAttribute('data-sidebar')
        ? new Proxy(style, { get: (t, k) => (k === 'transitionDuration' ? '0.26s' : Reflect.get(t, k)) })
        : style;
    });
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(sidebar()).not.toHaveAttribute('data-rail');
    const end = (target: Element, propertyName: string) => {
      const e = new Event('transitionend', { bubbles: true });
      Object.assign(e, { propertyName });
      fireEvent(target, e);
    };
    const body = sidebar().querySelector('[data-sidebar-body]');
    if (!body) throw new Error('sidebar body not found');
    end(body, 'translate');
    end(sidebar(), 'opacity');
    expect(sidebar()).not.toHaveAttribute('data-rail');
    end(sidebar(), 'translate');
    expect(sidebar()).toHaveAttribute('data-rail');
  });

  it('account button is disabled while the session is not known', () => {
    renderShell();
    expect(within(sidebar()).getByRole('button', { name: 'Account, loading' })).toBeDisabled();
  });
});

describe('mobile drawer', () => {
  it('opens the same navigation in a dialog and closes on navigation', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(drawer).getByRole('navigation', { name: 'Main' })).toBeInTheDocument();

    expect(within(drawer).getByRole('link', { name: /windle on GitHub/ })).toHaveAttribute('href', SOCIALS.github);

    fireEvent.click(within(drawer).getByRole('link', { name: 'Create' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('where')).toHaveTextContent('/create');
  });
});
