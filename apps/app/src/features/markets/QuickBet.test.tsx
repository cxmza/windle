import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWith } from '../predict/test-render';
import { FakeApi, ISO, makeMarket, WALLET } from '../predict/test-support';
import { SLIPPAGE_TOLERANCE } from '../predict/trading';
import { reloadPrefs } from '../settings/prefs';
import { MarketList } from './MarketList';
import { QuickBet } from './QuickBet';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const market = makeMarket({ slug: 'quick', statement: 'Quick ships', prob: 0.5 });
const closed = makeMarket({ slug: 'closed-one', status: 'closed', tradable: false, deadline: ISO(Date.now() - 1000) });
const mine = makeMarket({ slug: 'mine', statement: 'My own promise', creator: WALLET });

let fake: FakeApi;

const panel = () => screen.getByRole('dialog');
const amountField = () => within(panel()).getByLabelText('Amount (practice points)');
const openSide = (side: 'yes' | 'no') =>
  fireEvent.click(document.querySelector(`[data-quick-bet="${side}"]`) as HTMLElement);
/** The balance arrives with the portfolio; the chips stay off until then. */
const ready = () => waitFor(() => expect(within(panel()).getByRole('button', { name: '50' })).toBeEnabled());

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  localStorage.clear();
  reloadPrefs();
  fake = new FakeApi({ markets: [market, closed, mine] }).install();
});

afterEach(() => vi.unstubAllGlobals());

describe('quick bet', () => {
  it('offers Yes and No on a tradable market, and nothing on one that is closed', () => {
    const { rerender, client } = renderWith(<QuickBet market={market} now={Date.now()} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(document.querySelector('[data-quick-bet="yes"]')).toBeInTheDocument();
    expect(document.querySelector('[data-quick-bet="no"]')).toBeInTheDocument();
    expect(client).toBeDefined();
    rerender(<QuickBet market={closed} now={Date.now()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stops offering the buttons once the deadline has passed, even before the next refresh', () => {
    renderWith(<QuickBet market={market} now={Date.parse(market.deadline) + 1000} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the buttons disabled, with the reason, to the creator of the market', () => {
    renderWith(
      <QuickBet
        market={{ ...mine, viewer: { isCreator: true, canTrade: false, canResolve: true } }}
        now={Date.now()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleName(/You created this market/);
    }
    expect(document.querySelector('[data-quick-bet-blocked]')).toHaveAttribute('title', 'You created this market');
    fireEvent.click(buttons[0] as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a live quote, buys through the api with a slippage guard and updates the balance', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');

    const quote = panel().querySelector('[data-quote]') as HTMLElement;
    expect(within(quote).getAllByText('—')).toHaveLength(3);
    await ready();
    fireEvent.click(within(panel()).getByRole('button', { name: '50' }));
    expect(amountField()).toHaveValue('50');
    expect(within(quote).queryByText('—')).toBeNull();
    for (const row of ['Shares', 'Avg price', 'Potential payout']) {
      expect(within(quote).getByText(row)).toBeInTheDocument();
    }

    fireEvent.click(within(panel()).getByRole('button', { name: /^Buy .* · 50 practice points$/ }));
    await waitFor(() => expect(panel().querySelector('[data-quick-bet-confirmation]')).toBeInTheDocument());
    expect(fake.balance).toBeCloseTo(950, 6);

    const sent = fake.callsTo('POST', '/trades')[0];
    expect(sent?.path).toBe('/v1/markets/quick/trades');
    const body = sent?.body as { action: string; side: string; amountPts: number; minShares: number };
    expect(body).toMatchObject({ action: 'buy', side: 'yes', amountPts: 50 });
    const expected = 50 / 0.5;
    expect(body.minShares).toBeGreaterThan(0);
    expect(body.minShares).toBeLessThan(expected);
    const shares = fake.trades.get('quick')?.[0]?.shares ?? 0;
    expect(body.minShares).toBeCloseTo(shares * (1 - SLIPPAGE_TOLERANCE), 6);
  });

  it('takes a custom amount and submits with Enter', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('no');
    await ready();
    fireEvent.change(amountField(), { target: { value: '12,5x' } });
    expect(amountField()).toHaveValue('12,5');
    fireEvent.submit(amountField());
    await waitFor(() => expect(fake.balance).toBeCloseTo(1000 - 12.5, 6));
    expect(fake.positions.get('quick')?.noShares).toBeGreaterThan(0);
  });

  it('explains an amount above the balance and keeps the confirm button off', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');
    await ready();
    fireEvent.change(amountField(), { target: { value: '5000' } });
    expect(within(panel()).getByText(/You have 1,000 practice points/)).toBeInTheDocument();
    expect(amountField()).toBeInvalid();
    expect(within(panel()).getByRole('button', { name: /^Buy / })).toBeDisabled();
  });

  it('enforces the minimum amount', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');
    await ready();
    fireEvent.change(amountField(), { target: { value: '0.5' } });
    expect(within(panel()).getByText('Enter at least 1 practice point.')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: /^Buy / })).toBeDisabled();
  });

  it('fills the whole balance with Max', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');
    await ready();
    const max = within(panel()).getByRole('button', { name: 'Max' });
    expect(max).toBeEnabled();
    fireEvent.click(max);
    expect(amountField()).toHaveValue('1000');
  });

  it('moves focus to Done after a purchase instead of leaving it on the disabled Buy button', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');
    await ready();
    fireEvent.click(within(panel()).getByRole('button', { name: '50' }));
    fireEvent.click(within(panel()).getByRole('button', { name: /^Buy .* · 50 practice points$/ }));
    const done = await within(panel()).findByRole('button', { name: 'Done' });
    await waitFor(() => expect(done).toHaveFocus());
  });

  it('says what went wrong in words when the api refuses the order', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');
    await ready();
    fireEvent.click(within(panel()).getByRole('button', { name: '50' }));
    fake.override = (path) =>
      path.endsWith('/trades')
        ? new Response(JSON.stringify({ error: { code: 'slippage_exceeded', message: 'moved' } }), { status: 422 })
        : undefined;
    fireEvent.click(within(panel()).getByRole('button', { name: /^Buy / }));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent(
      'The price moved while the order was on its way',
    );
    expect(fake.balance).toBe(1000);
  });

  it('turns creator_cannot_trade from the server into the plain explanation', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');
    await ready();
    fireEvent.click(within(panel()).getByRole('button', { name: '50' }));
    fake.override = (path) =>
      path.endsWith('/trades')
        ? new Response(JSON.stringify({ error: { code: 'creator_cannot_trade', message: 'x' } }), { status: 403 })
        : undefined;
    fireEvent.click(within(panel()).getByRole('button', { name: /^Buy / }));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('You created this market');
  });

  it('keeps the coin in the amount field out of the accessibility tree and names the unit in the label', () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    openSide('yes');
    const field = amountField().parentElement as HTMLElement;
    const coin = field.querySelector('[data-coin]');
    expect(coin).toHaveAttribute('aria-hidden', 'true');
    expect(within(field).queryByRole('img')).toBeNull();
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    renderWith(<QuickBet market={market} now={Date.now()} />);
    const trigger = document.querySelector('[data-quick-bet="yes"]') as HTMLElement;
    fireEvent.click(trigger);
    expect(panel()).toBeInTheDocument();
    fireEvent.keyDown(panel(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('sits in the markets list: open rows get the buttons, and opening one does not navigate', async () => {
    renderWith(<MarketList now={Date.now()} />);
    const table = await screen.findByRole('table', { name: 'Market list' });
    const rows = within(table).getAllByRole('row').slice(1);
    for (const row of rows) {
      expect(within(row).getAllByRole('button').length).toBeGreaterThanOrEqual(2);
    }
    expect(within(table).getByRole('columnheader', { name: 'Quick bet and share' })).toBeInTheDocument();
  });
});
