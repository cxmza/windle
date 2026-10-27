import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWith } from '@/features/predict/test-render';
import { FakeApi, ISO, makeMarket, makeSettled } from '@/features/predict/test-support';
import { reloadPrefs } from '@/features/settings/prefs';
import { MarketList } from './MarketList';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.search}</div>;
}

const DAY = 86_400_000;
const soon = makeMarket({
  slug: 'soon',
  statement: 'Soon ships',
  deadline: ISO(Date.now() + DAY),
  volumePts: 40,
  traders: 2,
});
const later = makeMarket({
  slug: 'later',
  statement: 'Later ships',
  deadline: ISO(Date.now() + 5 * DAY),
  volumePts: 900,
  traders: 9,
  project: { slug: 'kestrel', name: 'Kestrel', ticker: 'KSTL' },
});
const backed = makeMarket({
  slug: 'backed-one',
  statement: 'Backed promise',
  tier: 'backed',
  deadline: ISO(Date.now() + 3 * DAY),
  collateral: { amountSol: 120, check: 'program upgrade authority is burned' },
});
const waiting = makeMarket({
  slug: 'waiting',
  statement: 'Waiting for the creator',
  status: 'closed',
  tradable: false,
  deadline: ISO(Date.now() - 1000),
});
const yes = makeSettled('yes', { slug: 'done-yes', statement: 'Kept promise' });
const voided = makeSettled('void', { slug: 'done-void', statement: 'Voided promise' });

let fake: FakeApi;

function renderList(url = '/') {
  return renderWith(
    <>
      <MarketList now={Date.now()} />
      <Where />
    </>,
    url,
  );
}

const table = () => screen.findByRole('table', { name: 'Market list' });
const hrefs = async () =>
  within(await table())
    .getAllByRole('link')
    .filter((a) => a.hasAttribute('data-row-link'))
    .map((a) => a.getAttribute('href'));

beforeEach(() => {
  window.localStorage.clear();
  reloadPrefs();
  fake = new FakeApi({ markets: [soon, later, backed, waiting, yes, voided] }).install();
});
afterEach(() => vi.unstubAllGlobals());

describe('market index from the api', () => {
  it('asks the api for open markets by deadline and lists them, each row linking to /m/:slug', async () => {
    renderList();
    expect(await hrefs()).toEqual(['/m/soon', '/m/backed-one', '/m/later']);
    const list = fake.callsTo('GET', '/v1/markets').find((c) => c.path === '/v1/markets');
    expect(list?.query.get('status')).toBe('open');
    expect(list?.query.get('sort')).toBe('closing');
    expect(list?.query.get('limit')).toBe('100');

    const row = within(await table()).getAllByRole('row')[1] as HTMLElement;
    expect(within(row).getByText('Soon ships')).toBeInTheDocument();
    expect(within(row).getByText('$SPRT')).toBeInTheDocument();
    expect(within(row).getByText('Community')).toBeInTheDocument();
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 markets open');
  });

  it('is a table with named columns, a quick bet and a share control per row, and no invented 24h column', async () => {
    renderList();
    expect(
      within(await table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Market', 'Odds', 'Volume (practice)', 'Traders', 'Closes', 'Status', 'Quick bet and share']);
    const row = within(await table()).getAllByRole('row')[1] as HTMLElement;
    expect(within(row).getByText('50%')).toBeInTheDocument();
    expect(row).toHaveTextContent(/2\s*traders/);
    expect(row.querySelector('[data-quick-bet="yes"]')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /^Share:/ })).toBeInTheDocument();
  });

  it('shows a skeleton first, then the rows', async () => {
    renderList();
    expect(screen.getByRole('status')).toHaveTextContent('Loading markets');
    await table();
    expect(screen.queryByText('Loading markets')).toBeNull();
  });

  it('tier tabs carry counts and filter the list through the url', async () => {
    renderList();
    await table();
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /^Community/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /^Backed/ })).toHaveTextContent('1');

    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Backed/ }));
    expect(screen.getByRole('tab', { name: /^Backed/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('where')).toHaveTextContent('tier=backed');
    expect(await hrefs()).toEqual(['/m/backed-one']);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /^All/ }));
    expect(screen.getByTestId('where')).not.toHaveTextContent('tier=');
  });

  it('status filter maps to the api: resolving is closed, resolved is settled', async () => {
    renderList();
    await table();
    fireEvent.click(screen.getByRole('radio', { name: 'Resolving' }));
    await waitFor(async () => expect(await hrefs()).toEqual(['/m/waiting']));
    expect(fake.calls.some((c) => c.query.get('status') === 'closed')).toBe(true);
    expect(screen.getByTestId('where')).toHaveTextContent('status=resolving');

    fireEvent.click(screen.getByRole('radio', { name: 'Resolved' }));
    await waitFor(async () => expect((await hrefs()).sort()).toEqual(['/m/done-void', '/m/done-yes']));
    expect(fake.calls.some((c) => c.query.get('status') === 'settled')).toBe(true);
    const row = within(await table())
      .getAllByRole('row')
      .find((r) => within(r).queryByText('Kept promise')) as HTMLElement;
    expect(within(row).getByText(/^Resolved: /)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Open' }));
    expect(screen.getByTestId('where')).not.toHaveTextContent('status=');
  });

  it('sorting asks the api; resolved markets default to newest first', async () => {
    renderList();
    await table();
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'volume' } });
    await waitFor(async () => expect(await hrefs()).toEqual(['/m/later', '/m/soon', '/m/backed-one']));
    expect(fake.calls.some((c) => c.query.get('sort') === 'volume')).toBe(true);
    expect(screen.getByTestId('where')).toHaveTextContent('sort=volume');

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'traders' } });
    await waitFor(async () => expect((await hrefs())[0]).toBe('/m/later'));

    fireEvent.click(screen.getByRole('radio', { name: 'Resolved' }));
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('new');
    await waitFor(() =>
      expect(fake.calls.some((c) => c.query.get('status') === 'settled' && c.query.get('sort') === 'new')).toBe(true),
    );
  });

  it('searches the loaded markets by statement, project and ticker, and offers a way out when nothing matches', async () => {
    renderList();
    await table();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search markets' }), { target: { value: 'kstl' } });
    expect(await hrefs()).toEqual(['/m/later']);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search markets' }), { target: { value: 'zzzz-no-match' } });
    expect(screen.queryByRole('table', { name: 'Market list' })).toBeNull();
    expect(screen.getByText(/match “zzzz-no-match”/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 markets');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await hrefs()).toHaveLength(3);
    expect(screen.getByTestId('where')).toBeEmptyDOMElement();
  });

  it('restores the filters from the url and links to the create flow', async () => {
    renderList('/?view=list&tier=community&status=resolved&sort=volume&q=voided');
    expect(await hrefs()).toEqual(['/m/done-void']);
    expect(screen.getByRole('tab', { name: /^Community/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: 'Resolved' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('volume');
    expect(screen.getByRole('searchbox', { name: 'Search markets' })).toHaveValue('voided');
    expect(screen.getByRole('link', { name: 'New market' })).toHaveAttribute('href', '/create');
  });

  it('arrow keys, Home and End move focus between rows', async () => {
    renderList();
    const links = within(await table())
      .getAllByRole('link')
      .filter((a) => a.hasAttribute('data-row-link'));
    (links[0] as HTMLElement).focus();
    fireEvent.keyDown(links[0] as HTMLElement, { key: 'ArrowDown' });
    expect(links[1]).toHaveFocus();
    fireEvent.keyDown(links[1] as HTMLElement, { key: 'End' });
    expect(links[links.length - 1]).toHaveFocus();
    fireEvent.keyDown(links[links.length - 1] as HTMLElement, { key: 'Home' });
    expect(links[0]).toHaveFocus();
  });

  it('shows a market as soon as it appears on the server, after the next refresh', async () => {
    const { client } = renderList();
    await table();
    fake.add(makeMarket({ slug: 'fresh', statement: 'Fresh from the wizard', deadline: ISO(Date.now() + 10 * DAY) }));
    await client.invalidateQueries({ queryKey: ['predict'] });
    expect(await screen.findByText('Fresh from the wizard')).toBeInTheDocument();
    expect(await hrefs()).toHaveLength(4);
  });

  it('pages through a long list with Show more', async () => {
    const many = Array.from({ length: 104 }, (_, i) =>
      makeMarket({ slug: `m-${i}`, statement: `Market number ${i}`, deadline: ISO(Date.now() + (i + 1) * 3_600_000) }),
    );
    fake = new FakeApi({ markets: many }).install();
    renderList();
    expect(await hrefs()).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: /Show more \(4 left\)/ }));
    await waitFor(async () => expect(await hrefs()).toHaveLength(104));
    expect(fake.calls.some((c) => c.query.get('offset') === '100')).toBe(true);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  }, 60_000);
});

describe('states', () => {
  it('an empty exchange reads as an intentional first step, pointing at the create wizard and the feed', async () => {
    fake = new FakeApi().install();
    const onShowFeed = vi.fn();
    renderWith(<MarketList now={Date.now()} onShowFeed={onShowFeed} />);
    expect(await screen.findByRole('heading', { level: 2, name: 'No open markets yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a market from a live post' })).toHaveAttribute('href', '/create');
    fireEvent.click(screen.getByRole('button', { name: 'Open the live feed' }));
    expect(onShowFeed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table', { name: 'Market list' })).toBeNull();
  });

  it('does not offer the feed button when the feed is already on screen', async () => {
    fake = new FakeApi().install();
    renderWith(<MarketList now={Date.now()} />);
    await screen.findByRole('heading', { level: 2, name: 'No open markets yet' });
    expect(screen.queryByRole('button', { name: 'Open the live feed' })).toBeNull();
  });

  it('a filtered view with no rows says so instead of repeating the first-market pitch', async () => {
    renderList('/?status=resolving&tier=backed');
    expect(await screen.findByText('No resolving markets here.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No open markets yet' })).toBeNull();
  });

  it('an unreachable api shows the retry banner, and a retry brings the list back', async () => {
    fake.failNext = new Response('{}', { status: 503 });
    renderList();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('windle is having trouble');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await hrefs()).toHaveLength(3);
  });
});

describe('share from a row', () => {
  it('copies the short link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderList();
    const row = within(await table()).getAllByRole('row')[1] as HTMLElement;
    fireEvent.keyDown(within(row).getByRole('button', { name: /^Share:/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.windle.fun/s/soon'));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('offers a pre-filled X post carrying the odds and the short link', async () => {
    renderList();
    const row = within(await table()).getAllByRole('row')[1] as HTMLElement;
    fireEvent.keyDown(within(row).getByRole('button', { name: /^Share:/ }), { key: 'Enter' });
    const post = await screen.findByRole('menuitem', { name: /Post on X/ });
    const href = new URL(post.getAttribute('href') ?? '');
    expect(`${href.origin}${href.pathname}`).toBe('https://x.com/intent/post');
    expect(href.searchParams.get('url')).toBe('https://app.windle.fun/s/soon');
    expect(href.searchParams.get('text')).toContain('Soon ships');
    expect(href.searchParams.get('text')).toContain('50%');
    expect(post).toHaveAttribute('target', '_blank');
    expect(post.getAttribute('rel')).toContain('noopener');
  });
});
