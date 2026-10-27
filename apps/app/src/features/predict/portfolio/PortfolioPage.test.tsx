import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadPrefs } from '@/features/settings/prefs';
import { renderWith } from '../test-render';
import { FakeApi, ISO, makeMarket, makeSettled, WALLET } from '../test-support';
import { PortfolioPage } from './PortfolioPage';

const HOUR = 3_600_000;
const open = makeMarket({ slug: 'open-one', statement: 'Open promise', prob: 0.5 });
const won = makeSettled('yes', { slug: 'won-one', statement: 'Won promise' });
const lost = makeSettled('no', { slug: 'lost-one', statement: 'Lost promise' });
const refunded = makeSettled('void', { slug: 'void-one', statement: 'Voided promise' });

const settledAt = ISO(Date.now() - HOUR);
const holdings = {
  'open-one': { yesShares: 100, yesCostPts: 60, costBasisPts: 60 },
  'won-one': { yesShares: 50, realizedPts: 20, claimed: true, payoutPts: 50, settledAt },
  'lost-one': { yesShares: 40, realizedPts: -25, claimed: true, payoutPts: 0, settledAt },
};

let fake: FakeApi;

const tile = (label: string) => {
  const dl = screen.getByText(label, { selector: 'dt' }).closest('dl');
  if (!dl) throw new Error(`no tile ${label}`);
  return dl;
};

const loaded = () => screen.findByText('Balance', { selector: 'dt' });

beforeEach(() => {
  window.localStorage.clear();
  reloadPrefs();
  fake = new FakeApi({ markets: [open, won, lost, refunded] }).install();
});

afterEach(() => vi.unstubAllGlobals());

describe('portfolio: empty', () => {
  it('shows the starting balance, a practice-points note and the two ways forward', async () => {
    renderWith(<PortfolioPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your portfolio');
    await loaded();
    expect(screen.getByText(/Practice points, no real value/)).toBeInTheDocument();
    expect(tile('Balance')).toHaveTextContent('1,000');
    expect(tile('Profit and loss')).toHaveTextContent('0');
    expect(screen.getByRole('heading', { level: 2, name: 'No positions yet' })).toBeInTheDocument();
    expect(screen.getByText(/You start with 1,000 practice points/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Create a market' })).toHaveAttribute('href', '/create');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('has no claim controls: settlement is automatic', async () => {
    renderWith(<PortfolioPage />);
    await loaded();
    expect(screen.queryByRole('button', { name: /Claim/ })).toBeNull();
    expect(screen.queryByText('Claimable')).toBeNull();
  });

  it('shows rank as a dash with a nudge to trade until the first trade', async () => {
    renderWith(<PortfolioPage />);
    await loaded();
    expect(tile('Leaderboard rank')).toHaveTextContent('—');
    expect(within(tile('Leaderboard rank')).getByRole('link', { name: 'Trade to get ranked' })).toHaveAttribute(
      'href',
      '/leaderboard',
    );
  });
});

describe('portfolio: from the api', () => {
  beforeEach(() => {
    fake = new FakeApi({ markets: [open, won, lost, refunded], balance: 800, positions: holdings }).install();
  });

  it('reports the server summary: balance, open value, equity, P&L and rank', async () => {
    renderWith(<PortfolioPage />);
    await loaded();
    expect(tile('Balance')).toHaveTextContent('800');
    expect(tile('In positions')).toHaveTextContent('50');
    expect(tile('Equity')).toHaveTextContent('850');
    const pnl = tile('Profit and loss');
    expect(pnl).toHaveTextContent('−150');
    expect(pnl).toHaveTextContent('Realized −5 · Unrealized −10');
    expect(tile('Leaderboard rank')).toHaveTextContent('#1');
  });

  it('lists open positions by default and settled ones behind the filter, each linking to its market', async () => {
    renderWith(<PortfolioPage />);
    const table = await screen.findByRole('region', { name: 'Positions table' });
    let rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'Open promise' })).toHaveAttribute(
      'href',
      '/m/open-one',
    );
    expect(within(rows[0] as HTMLElement).getByText('Ships')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('0.60')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Settled/ }));
    rows = within(screen.getByRole('region', { name: 'Positions table' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    const winning = rows.find((r) => within(r).queryByText('Won promise')) as HTMLElement;
    expect(within(winning).getByText('+20')).toBeInTheDocument();
    expect(within(winning).getByText('Resolved: Ships')).toBeInTheDocument();
    expect(winning.querySelector('[data-paid-out]')).toHaveTextContent('Paid out 50');
    const losing = rows.find((r) => within(r).queryByText('Lost promise')) as HTMLElement;
    expect(within(losing).getByText('−25')).toBeInTheDocument();
    expect(losing.querySelector('[data-paid-out]')).toHaveTextContent('Paid out 0');
    expect(within(losing).queryByRole('button')).toBeNull();
  });

  it('shows a voided position as refunded', async () => {
    fake = new FakeApi({
      markets: [refunded],
      positions: { 'void-one': { noShares: 20, claimed: true, payoutPts: 8, realizedPts: 0, settledAt } },
    }).install();
    renderWith(<PortfolioPage />);
    fireEvent.click(await screen.findByRole('radio', { name: /Settled/ }));
    const row = within(await screen.findByRole('region', { name: 'Positions table' })).getAllByRole(
      'row',
    )[1] as HTMLElement;
    expect(row.querySelector('[data-paid-out]')).toHaveTextContent('Refunded 8');
  });

  it('lists the trades the api returns, newest first, linking to their markets', async () => {
    const at = (min: number) => ISO(Date.now() - min * 60_000);
    fake.trades.set('open-one', [
      {
        id: 't2',
        marketId: open.id,
        marketSlug: open.slug,
        action: 'buy',
        side: 'no',
        shares: 50,
        costPts: 25,
        priceBefore: 0.5,
        priceAfter: 0.4,
        by: WALLET,
        at: at(1),
      },
      {
        id: 't1',
        marketId: open.id,
        marketSlug: open.slug,
        action: 'buy',
        side: 'yes',
        shares: 100,
        costPts: 60,
        priceBefore: 0.5,
        priceAfter: 0.6,
        by: WALLET,
        at: at(5),
      },
    ]);
    renderWith(<PortfolioPage />);
    const trades = (await screen.findByRole('heading', { name: 'Trade history' })).closest('section') as HTMLElement;
    const items = within(trades).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Bought .* Doesn't ship in/);
    expect(items[0]).toHaveTextContent('−25');
    expect(items[1]).toHaveTextContent(/Bought .* Ships in/);
    expect(within(items[1] as HTMLElement).getByRole('link', { name: 'Open promise' })).toHaveAttribute(
      'href',
      '/m/open-one',
    );
  });

  it('refreshes by itself: a position added on the server shows up on the next poll', async () => {
    const { client } = renderWith(<PortfolioPage />);
    await screen.findByRole('region', { name: 'Positions table' });
    const held = fake.positions.get('open-one');
    if (!held) throw new Error('position missing');
    fake.positions.set('open-one', { ...held, yesShares: 200, yesCostPts: 120 });
    await client.invalidateQueries({ queryKey: ['predict', 'portfolio'] });
    await waitFor(() => expect(tile('In positions')).toHaveTextContent('100'));
  });
});

describe('portfolio: failure', () => {
  it('shows the retry banner when the api is unreachable, and recovers', async () => {
    fake.failNext = new Response('{}', { status: 503 });
    renderWith(<PortfolioPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('windle is having trouble');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await loaded()).toBeInTheDocument();
  });
});
