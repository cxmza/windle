import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadPrefs, resetPrefs, setPref } from '@/features/settings/prefs';
import { renderWith } from '../test-render';
import { FakeApi, ISO, makeMarket, makeResolution, makeSettled, makeTweet, WALLET } from '../test-support';
import type { CandleChartInput } from './candle-chart-engine';
import { MarketPage } from './MarketPage';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const chart = vi.hoisted(() => ({
  renders: [] as CandleChartInput[],
  created: 0,
  destroyed: 0,
  onHover: null as null | ((time: number | null) => void),
}));

vi.mock('./candle-chart-engine', () => ({
  createCandleChart: (_el: HTMLElement, onHover: typeof chart.onHover) => {
    chart.created += 1;
    chart.onHover = onHover;
    return {
      render: (input: CandleChartInput) => void chart.renders.push(input),
      destroy: () => {
        chart.destroyed += 1;
      },
    };
  },
}));

vi.mock('./chart-theme', () => ({
  readChartTheme: () => ({
    up: 'u',
    down: 'd',
    volumeUp: 'vu',
    volumeDown: 'vd',
    volumeBot: 'vb',
    line: { yes: 'ly', no: 'ln' },
    grid: 'g',
    text: 'x',
    crosshair: 'c',
    crosshairLabel: 'cl',
    fontFamily: 'f',
  }),
}));

function stubViewport(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

let fake: FakeApi;

function renderMarket(slug: string, { wide = true }: { wide?: boolean } = {}) {
  stubViewport(wide);
  return renderWith(
    <Routes>
      <Route path="/m/:slug" element={<MarketPage />} />
    </Routes>,
    `/m/${slug}`,
  );
}

const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
const balanceText = () => screen.getByText('Balance', { selector: 'p' }).textContent ?? '';
const loaded = () => screen.findByRole('heading', { level: 1 });
/** The balance arrives with the portfolio, a beat after the page. */
const balanceLoaded = () => waitFor(() => expect(balanceText()).toContain('1,000'));

const sprout = makeMarket({
  slug: 'sprout-staking-v2',
  statement: 'Sprout ships staking v2 to mainnet',
  createdAt: ISO(Date.now() - 5 * DAY),
  source: makeTweet('1900000000000001001'),
});
const kestrel = makeMarket({
  slug: 'kestrel-vaults',
  statement: 'Kestrel opens vaults',
  tier: 'backed',
  project: { slug: 'kestrel', name: 'Kestrel', ticker: 'KSTL' },
  collateral: { amountSol: 250, check: 'vault program is deployed and audited' },
});
const waiting = makeMarket({
  slug: 'waiting-one',
  statement: 'Waiting for the creator',
  status: 'closed',
  tradable: false,
  deadline: ISO(Date.now() - HOUR),
});
const mine = makeMarket({ slug: 'mine-one', statement: 'My own promise', creator: WALLET });
const mineOver = makeMarket({
  slug: 'mine-over',
  statement: 'My promise past its deadline',
  creator: WALLET,
  status: 'closed',
  tradable: false,
  deadline: ISO(Date.now() - HOUR),
});
const done = makeSettled('yes', { slug: 'done-yes', statement: 'Kept promise' });
const missed = makeSettled('no', { slug: 'done-no', statement: 'Broken promise' });
const voided = makeSettled('void', { slug: 'done-void', statement: 'Voided promise' });
const markets = [sprout, kestrel, waiting, mine, mineOver, done, missed, voided];

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  localStorage.clear();
  reloadPrefs();
  chart.renders.length = 0;
  chart.created = 0;
  chart.destroyed = 0;
  chart.onHover = null;
  fake = new FakeApi({ markets }).install();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetPrefs();
  localStorage.clear();
});

describe('market page states', () => {
  it('shows an open community market with the team tweet and who resolves it', async () => {
    renderMarket('sprout-staking-v2');
    expect(await loaded()).toHaveTextContent(sprout.statement);
    expect(document.title).toContain(sprout.statement);
    expect(screen.getByText('Community')).toBeInTheDocument();
    expect(screen.getByText('Open', { selector: '[data-status]' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "The team's tweet" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View on X/ })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/Snapshot captured/)).toHaveTextContent(/original may be edited or deleted/);
    openTab('Resolution');
    expect(
      screen.getByText('The market creator decides the outcome. Payouts are automatic and final.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /coming soon/ })).toBeNull();
    expect(screen.getByText('Practice points — no real value.')).toBeInTheDocument();
    expect(screen.getByText(sprout.criteria)).toBeInTheDocument();
    await waitFor(() => expect(chart.renders.length).toBeGreaterThan(0));
  });

  it('shows a loading skeleton first, then the page', async () => {
    renderMarket('sprout-staking-v2');
    expect(screen.getByRole('status')).toHaveTextContent('Loading the market');
    expect(document.querySelector('[data-market-skeleton]')).toBeInTheDocument();
    await loaded();
    expect(document.querySelector('[data-market-skeleton]')).toBeNull();
  });

  it('shows a backed market with collateral, the on-chain check and no resolver', async () => {
    renderMarket('kestrel-vaults');
    await loaded();
    expect(screen.getByText('Backed · 250 SOL')).toBeInTheDocument();
    openTab('Resolution');
    expect(screen.getByText('Resolves from chain state at the deadline — no resolver.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Resolution' })).getByText('vault program is deployed and audited'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Buy Slashed/ })).toBeInTheDocument();
  });

  it('says a closed market waits for its creator and takes no orders', async () => {
    renderMarket('waiting-one');
    await loaded();
    expect(screen.getByText('Closed · awaiting resolution')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the creator to resolve the market/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trading closed' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Amount/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Buy/ })).toBeNull();
  });

  it.each([
    ['done-yes', 'Resolved · Ships', 'Final outcome Ships'],
    ['done-no', "Resolved · Doesn't ship", "Final outcome Doesn't ship"],
  ])('shows %s as final with who decided it', async (slug, label, outcome) => {
    renderMarket(slug);
    await loaded();
    expect(screen.getByText(label)).toBeInTheDocument();
    openTab('Resolution');
    expect(document.querySelector('[data-resolution-outcome]')).toHaveTextContent(outcome);
    expect(document.querySelector('[data-resolution-outcome]')).toHaveTextContent("by the market's creator");
    expect(screen.getByText(/Winning positions were paid out automatically/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Buy/ })).toBeNull();
    expect(screen.queryByLabelText(/^Amount/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Claim/ })).toBeNull();
  });

  it('shows a voided market with a refund note', async () => {
    renderMarket('done-void');
    await loaded();
    expect(screen.getAllByText('Voided').length).toBeGreaterThan(0);
    openTab('Resolution');
    expect(screen.getByText('Voided: every position was refunded at cost.')).toBeInTheDocument();
  });

  it('shows the creator note of a resolution', async () => {
    fake.add(
      makeSettled('yes', {
        slug: 'noted',
        statement: 'Noted promise',
        resolution: makeResolution('yes', 'admin', 'Mainnet tx is linked in the docs'),
      }),
    );
    renderMarket('noted');
    await loaded();
    openTab('Resolution');
    expect(screen.getByText(/“Mainnet tx is linked in the docs”/)).toBeInTheDocument();
    expect(document.querySelector('[data-resolution-outcome]')).toHaveTextContent('by an admin');
  });

  it('shows a not-found state for an unknown slug', async () => {
    renderMarket('no-such-market');
    expect(await screen.findByRole('heading', { level: 1, name: /market not found/i })).toBeInTheDocument();
    expect(document.title).toBe('Market not found — windle');
    expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/');
  });

  it('shows the retry banner, not not-found, when the api is down', async () => {
    let down = true;
    fake.override = (path) =>
      down && path.startsWith('/v1/markets/') ? new Response('{}', { status: 503 }) : undefined;
    renderMarket('sprout-staking-v2');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('windle is having trouble');
    down = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await loaded()).toHaveTextContent(sprout.statement);
  });

  it('asks the api for the market, its trades and history in one request, by slug', async () => {
    renderMarket('sprout-staking-v2');
    await loaded();
    expect(fake.calls.filter((c) => c.path === '/v1/markets/sprout-staking-v2')).toHaveLength(1);
  });
});

describe('chart', () => {
  const lastRender = () => chart.renders.at(-1);

  beforeEach(() => {
    const now = Date.now();
    fake.history.set('sprout-staking-v2', [
      { t: now - 3 * DAY, p: 0.5 },
      { t: now - 2 * HOUR, p: 0.6 },
      { t: now - HOUR, p: 0.62 },
    ]);
  });

  it('asks for candles by the default timeframe of the market age and feeds them to the lazily loaded engine', async () => {
    const view = renderMarket('sprout-staking-v2');
    await waitFor(() => expect(chart.renders.length).toBeGreaterThan(0));
    const call = fake.callsTo('GET', '/candles')[0];
    expect(call?.query.get('tf')).toBe('1h');
    expect(call?.query.get('side')).toBe('yes');
    expect(lastRender()?.tf).toBe('1h');
    expect(lastRender()?.candles.at(-1)?.close).toBe(62);
    expect(lastRender()?.volume.total).toHaveLength(lastRender()?.candles.length ?? -1);

    view.unmount();
    expect(chart.destroyed).toBe(chart.created);
  });

  it('refetches for a new timeframe and keeps the engine alive', async () => {
    renderMarket('sprout-staking-v2');
    await waitFor(() => expect(chart.renders.length).toBeGreaterThan(0));
    const created = chart.created;
    fireEvent.click(screen.getByRole('radio', { name: '15m' }));
    await waitFor(() => expect(lastRender()?.tf).toBe('15m'));
    expect(fake.callsTo('GET', '/candles').some((c) => c.query.get('tf') === '15m')).toBe(true);
    expect(chart.created).toBe(created);
  });

  it("inverts the prices for Doesn't ship", async () => {
    renderMarket('sprout-staking-v2');
    await waitFor(() => expect(chart.renders.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('radio', { name: "Doesn't ship" }));
    await waitFor(() => expect(lastRender()?.side).toBe('no'));
    await waitFor(() => expect(lastRender()?.candles.at(-1)?.close).toBe(38));
    expect(fake.callsTo('GET', '/candles').some((c) => c.query.get('side') === 'no')).toBe(true);
  });

  it('switches between candles and a line', async () => {
    renderMarket('sprout-staking-v2');
    await waitFor(() => expect(lastRender()?.kind).toBe('candles'));
    fireEvent.click(screen.getByRole('radio', { name: 'Line' }));
    await waitFor(() => expect(lastRender()?.kind).toBe('line'));
    expect(lastRender()?.line.at(-1)?.value).toBe(62);
  });

  it('shows the hovered candle in the legend line and the last one otherwise', async () => {
    renderMarket('sprout-staking-v2');
    await waitFor(() => expect(chart.onHover).not.toBeNull());
    const legend = () => document.querySelector('[data-chart-legend]') as HTMLElement;
    await waitFor(() => expect(legend()).toHaveTextContent('C62.0%'));
    const first = lastRender()?.candles[0];
    act(() => chart.onHover?.(first?.time ?? 0));
    await waitFor(() => expect(legend()).toHaveTextContent('C50.0%'));
    act(() => chart.onHover?.(null));
    await waitFor(() => expect(legend()).toHaveTextContent('C62.0%'));
  });

  it('keeps a market with no trades honest: flat candles and a note in the legend row', async () => {
    fake.history.set('sprout-staking-v2', [{ t: Date.now() - DAY, p: 0.5 }]);
    renderMarket('sprout-staking-v2');
    await waitFor(() => expect(document.querySelector('[data-chart-empty]')).toHaveTextContent('No trades yet'));
    expect(document.querySelector('[data-chart-empty]')).toHaveTextContent('50%');
    expect(new Set(lastRender()?.candles.map((c) => c.close))).toEqual(new Set([50]));
    expect(document.querySelector('[data-chart-empty]')?.className).not.toContain('absolute');
  });

  it('says so, with a way to retry, when the candles cannot load', async () => {
    fake.override = (path) => (path.endsWith('/candles') ? new Response('{}', { status: 503 }) : undefined);
    renderMarket('sprout-staking-v2');
    expect(await screen.findByText('The chart could not load. Odds and trades are unaffected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('header', () => {
  it('shows who made the market, the price with its 24h change and the counters, bots in plain sight', async () => {
    fake.add({
      ...sprout,
      slug: 'busy',
      volumePts: 20_300,
      traders: 4,
      stats: { change24hPp: 4.2, buys: 191, sells: 181, botTrades: 30, humanTraders: 187 },
    });
    renderMarket('busy');
    await loaded();
    const header = document.querySelector('[data-market-header]') as HTMLElement;
    expect(header).toHaveTextContent('Created by');
    expect(header.querySelector('[data-change]')).toHaveAttribute('data-change', 'up');
    expect(header.querySelector('[data-change]')).toHaveTextContent('+4.2 pp');
    const stats = within(header).getByText('Volume').closest('dl') as HTMLElement;
    expect(stats).toHaveTextContent('Buys191');
    expect(stats).toHaveTextContent('Sells181');
    expect(stats).toHaveTextContent('Traders187');
    expect(header).toHaveTextContent('incl. 30 bot trades');
  });

  it('shows a dash instead of a change while nobody has traded', async () => {
    fake.add({
      ...sprout,
      slug: 'quiet',
      stats: { change24hPp: null, buys: 0, sells: 0, botTrades: 0, humanTraders: 0 },
    });
    renderMarket('quiet');
    await loaded();
    expect(document.querySelector('[data-change]')).toHaveAttribute('data-change', 'none');
    expect(document.querySelector('[data-market-header]')).not.toHaveTextContent('incl.');
  });

  it('tints the countdown chip by the risk of the preset and counts down in hh:mm:ss', async () => {
    fake.add({ ...sprout, slug: 'slow-one', durationPreset: 'slow', deadline: ISO(Date.now() + HOUR + 7 * 60_000) });
    renderMarket('slow-one');
    await loaded();
    const chip = document.querySelector('[data-countdown-chip]') as HTMLElement;
    expect(chip).toHaveAttribute('data-risk', 'medium');
    expect(chip).toHaveTextContent(/^SLOW\s*•\s*01:0[67]:\d{2}$/);
  });

  it('beats the countdown chip only through the last minute of trading', async () => {
    fake.add({ ...sprout, slug: 'closing', durationPreset: 'flash', deadline: ISO(Date.now() + 30_000) });
    fake.add({ ...sprout, slug: 'calm', durationPreset: 'flash', deadline: ISO(Date.now() + 10 * 60_000) });
    const closing = renderMarket('closing');
    await loaded();
    const chip = () => document.querySelector('[data-countdown-chip]') as HTMLElement;
    expect(chip()).toHaveAttribute('data-final-minute');
    expect(chip().getAttribute('data-beat')).toMatch(/^[ab]$/);
    closing.unmount();
    renderMarket('calm');
    await loaded();
    expect(chip()).not.toHaveAttribute('data-final-minute');
    expect(chip()).not.toHaveAttribute('data-beat');
  });

  it('keeps a custom deadline neutral and a long one in days', async () => {
    renderMarket('sprout-staking-v2');
    await loaded();
    const chip = document.querySelector('[data-countdown-chip]') as HTMLElement;
    expect(chip).toHaveAttribute('data-risk', 'custom');
    expect(chip).toHaveTextContent(/^CUSTOM\s*•\s*\d+d \d+h$/);
  });
});

describe('tabs', () => {
  it('says so when the viewer holds no position', async () => {
    renderMarket('sprout-staking-v2');
    await loaded();
    openTab('My position');
    expect(await screen.findByText('You hold no position in this market yet.')).toBeInTheDocument();
  });

  it('opens on the position tab for a holder', async () => {
    fake = new FakeApi({ markets, positions: { 'sprout-staking-v2': { yesShares: 12 } } }).install();
    renderMarket('sprout-staking-v2');
    expect(await screen.findByRole('region', { name: 'Your position' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My position' })).toHaveAttribute('data-state', 'active');
  });

  it('opens a creator on the resolution tab once trading closed', async () => {
    renderMarket('mine-over');
    await loaded();
    expect(screen.getByRole('tab', { name: 'Resolution' })).toHaveAttribute('data-state', 'active');
  });
});

describe('activity', () => {
  it('lists recent trades from the api and marks the viewer', async () => {
    const at = ISO(Date.now() - 60_000);
    fake.trades.set('sprout-staking-v2', [
      {
        id: 't2',
        marketId: sprout.id,
        marketSlug: sprout.slug,
        action: 'buy',
        side: 'no',
        shares: 20,
        costPts: 10,
        priceBefore: 0.5,
        priceAfter: 0.45,
        by: WALLET,
        at,
      },
      {
        id: 't1',
        marketId: sprout.id,
        marketSlug: sprout.slug,
        action: 'sell',
        side: 'yes',
        shares: 5,
        costPts: 2.5,
        priceBefore: 0.52,
        priceAfter: 0.5,
        by: 'So11111111111111111111111111111111111111112',
        at,
      },
    ]);
    renderMarket('sprout-staking-v2');
    await loaded();
    const rows = await waitFor(() => {
      const found = document.querySelectorAll('[data-activity-row]');
      expect(found).toHaveLength(2);
      return found;
    });
    expect(rows[0]).toHaveTextContent('Bought');
    expect(rows[0]).toHaveAttribute('data-mine');
    expect(rows[1]).toHaveTextContent('Sold');
    expect(rows[1]).not.toHaveAttribute('data-mine');
  });

  it('invites the first trade when there are none', async () => {
    renderMarket('sprout-staking-v2');
    expect(await screen.findByText('No trades yet. The first one sets the price.')).toBeInTheDocument();
  });

  it('labels house bot trades BOT with an explanation and leaves human trades unlabelled', async () => {
    const base = {
      marketId: sprout.id,
      marketSlug: sprout.slug,
      action: 'buy',
      side: 'yes',
      shares: 4,
      costPts: 2,
      priceBefore: 0.5,
      priceAfter: 0.52,
      by: 'So11111111111111111111111111111111111111112',
      at: ISO(Date.now() - 60_000),
    } as const;
    fake.trades.set('sprout-staking-v2', [
      { ...base, id: 'bot1', bot: true },
      { ...base, id: 'human1' },
    ] as never);
    renderMarket('sprout-staking-v2');
    const rows = await waitFor(() => {
      const found = document.querySelectorAll('[data-activity-row]');
      expect(found).toHaveLength(2);
      return found;
    });
    const badge = (rows[0] as HTMLElement).querySelector('[data-bot-badge]');
    expect(badge).toHaveTextContent(/^BOT/);
    expect(badge).toHaveAttribute('title', 'House market-making bot — practice points, not ranked');
    expect(rows[0]).toHaveAttribute('data-bot');
    expect((rows[1] as HTMLElement).querySelector('[data-bot-badge]')).toBeNull();
    expect(rows[1]).not.toHaveAttribute('data-bot');
  });
});

describe('trading', () => {
  const amountInput = () => screen.getByLabelText(/^Amount/);

  it('previews a quote per side, buys with a slippage guard, updates the balance and shows the position', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    expect(screen.queryByRole('region', { name: 'Your position' })).toBeNull();

    fireEvent.change(amountInput(), { target: { value: '50' } });
    const quote = document.querySelector('[data-quote]') as HTMLElement;
    for (const side of ['yes', 'no']) {
      const column = quote.querySelector(`[data-quote-side="${side}"]`) as HTMLElement;
      for (const row of ['Shares', 'Avg price', 'Payout']) {
        expect(within(column).getByText(row)).toBeInTheDocument();
      }
      expect(within(column).queryByText('—')).toBeNull();
    }

    fireEvent.click(screen.getByRole('button', { name: /^Buy Ships/ }));
    await waitFor(() =>
      expect(document.querySelector('[data-trade-confirmation]')?.textContent).toMatch(
        /^Bought .* Ships shares for 50\s?\.$/,
      ),
    );
    expect(balanceText()).toContain('950');
    const position = await screen.findByRole('region', { name: 'Your position' });
    expect(within(position).getByText('Ships')).toBeInTheDocument();
    expect(within(position).getByText(/Unrealized P&L/)).toBeInTheDocument();
    openTab('Trades');
    const mineRow = await waitFor(() => {
      const row = document.querySelector('[data-activity] [data-mine]');
      expect(row).not.toBeNull();
      return row;
    });
    expect(mineRow).toHaveTextContent('You');

    const body = fake.callsTo('POST', '/trades')[0]?.body as { minShares: number; amountPts: number; side: string };
    expect(body.amountPts).toBe(50);
    expect(body.side).toBe('yes');
    expect(body.minShares).toBeGreaterThan(0);
  });

  it('places the order on the side of the button that was pressed, with no side to pick first', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    expect(screen.queryByRole('group', { name: 'Outcome' })).toBeNull();
    fireEvent.change(amountInput(), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^Buy Doesn't ship/ }));
    await waitFor(() => expect(fake.callsTo('POST', '/trades')).toHaveLength(1));
    expect(fake.callsTo('POST', '/trades')[0]?.body).toMatchObject({ side: 'no' });
  });

  it('fills the amount from the presets and Max, and keeps the slider in step with it', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    const slider = () => screen.getByRole('slider', { name: 'Share of balance' });
    expect(slider()).toHaveAttribute('aria-valuenow', '0');
    for (const preset of ['10', '50', '100', '500']) {
      fireEvent.click(screen.getByRole('button', { name: preset }));
      expect(amountInput()).toHaveValue(preset);
    }
    expect(slider()).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(amountInput()).toHaveValue('1000');
    expect(slider()).toHaveAttribute('aria-valuenow', '100');
  });

  it('turns the slider into a share of the balance', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    const slider = screen.getByRole('slider', { name: 'Share of balance' });
    fireEvent.keyDown(slider, { key: 'End' });
    expect(amountInput()).toHaveValue('1000');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(amountInput()).toHaveValue('');
  });

  it('sells the whole position with the Max chip, sending the exact holding', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    fireEvent.change(amountInput(), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /^Buy Ships/ }));
    await waitFor(() => expect(balanceText()).toContain('960'));
    await screen.findByRole('region', { name: 'Your position' });

    fireEvent.click(screen.getByRole('radio', { name: 'Sell' }));
    expect(screen.getByLabelText(/^Shares of Ships/)).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    const sell = screen.getByRole('button', { name: /^Sell Ships/ });
    expect(sell).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Sell Doesn't ship/ })).toBeDisabled();
    fireEvent.click(sell);
    await waitFor(() => expect(document.querySelector('[data-trade-confirmation]')?.textContent).toMatch(/^Sold /));
    expect(balanceText()).toContain('1,000');

    const bought = fake.trades.get('sprout-staking-v2')?.find((t) => t.action === 'buy');
    const sold = fake.callsTo('POST', '/trades').at(-1)?.body as {
      action: string;
      shares: number;
      minProceedsPts: number;
    };
    expect(sold.action).toBe('sell');
    expect(sold.shares).toBe(bought?.shares);
    expect(sold.minProceedsPts).toBeGreaterThan(0);
  });

  it('shows empty quotes before anything is typed and says why a chip is off', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    const quote = document.querySelector('[data-quote]') as HTMLElement;
    expect(quote.querySelectorAll('[data-quote-side]')).toHaveLength(2);
    expect(within(quote).getAllByText('—')).toHaveLength(6);
    expect(screen.getByRole('button', { name: /^Buy Ships/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Buy Doesn't ship/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Sell' }));
    expect(screen.getByRole('button', { name: 'Max' })).toHaveAccessibleDescription('You hold no Ships shares');
    expect((document.querySelector('[data-quote]') as HTMLElement).querySelectorAll('dt')).toHaveLength(8);
  });

  it('explains insufficient balance and keeps both side buttons disabled', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    fireEvent.change(amountInput(), { target: { value: '5000' } });
    expect(screen.getByText(/You have 1,000 practice points/)).toBeInTheDocument();
    expect(amountInput()).toBeInvalid();
    expect(screen.getByRole('button', { name: /^Buy Ships/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Buy Doesn't ship/ })).toBeDisabled();
  });

  it('explains insufficient shares when selling more than owned', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    fireEvent.click(screen.getByRole('radio', { name: 'Sell' }));
    expect(screen.getByText('You hold no shares to sell.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Shares of Ships/), { target: { value: '3' } });
    expect(screen.getAllByText(/You hold no .* shares to sell\./).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Sell Ships/ })).toBeDisabled();
  });

  it('turns a slippage refusal into advice and leaves the balance alone', async () => {
    renderMarket('sprout-staking-v2');
    await balanceLoaded();
    fireEvent.change(amountInput(), { target: { value: '30' } });
    fake.override = (path) =>
      path.endsWith('/trades')
        ? new Response(JSON.stringify({ error: { code: 'slippage_exceeded', message: 'moved' } }), { status: 422 })
        : undefined;
    fireEvent.click(screen.getByRole('button', { name: /^Buy Ships/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The price moved while the order was on its way');
    expect(balanceText()).toContain('1,000');
  });

  it('opens the trade sheet from the mobile bar and trades from there', async () => {
    renderMarket('sprout-staking-v2', { wide: false });
    await loaded();
    expect(document.querySelector('[data-trade-panel]')).toBeNull();
    const bar = document.querySelector('[data-trade-bar]') as HTMLElement;
    fireEvent.click(within(bar).getByRole('button', { name: /Doesn't ship/ }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.change(within(sheet).getByLabelText(/^Amount/), { target: { value: '20' } });
    expect(within(sheet).getByRole('button', { name: /^Buy Doesn't ship/ })).toBeEnabled();
    expect(within(sheet).getByRole('button', { name: /^Buy Ships/ })).toBeEnabled();
  });
});

describe('creator', () => {
  it('cannot trade on their own market and is told why, in the panel and in the mobile bar', async () => {
    renderMarket('mine-one');
    await loaded();
    const panel = document.querySelector('[data-trade-panel]') as HTMLElement;
    expect(panel).toHaveAttribute('data-creator-block');
    expect(within(panel).getByRole('heading', { name: 'You created this market' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Amount/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Buy/ })).toBeNull();
  });

  it('sees the same notice in the mobile bar', async () => {
    renderMarket('mine-one', { wide: false });
    await loaded();
    const bar = document.querySelector('[data-trade-bar]') as HTMLElement;
    expect(bar).toHaveTextContent('You created this market, so you cannot trade on it.');
    expect(within(bar).queryByRole('button')).toBeNull();
  });
});

describe('resolve', () => {
  const resolvePanel = () => document.querySelector('[data-resolve-panel]') as HTMLElement;
  const outcomeButton = (outcome: 'yes' | 'no' | 'void') =>
    resolvePanel().querySelector(`[data-outcome="${outcome}"]`) as HTMLButtonElement;

  it('is not offered to a visitor who neither created the market nor administers it', async () => {
    renderMarket('sprout-staking-v2');
    await loaded();
    openTab('Resolution');
    expect(resolvePanel()).toBeNull();
  });

  it('lets the creator say Ships or Void any time, and holds back "no" until the deadline with the reason', async () => {
    renderMarket('mine-one');
    await loaded();
    openTab('Resolution');
    expect(within(resolvePanel()).getByRole('heading', { name: 'Resolve your market' })).toBeInTheDocument();
    expect(outcomeButton('yes')).toBeEnabled();
    expect(outcomeButton('void')).toBeEnabled();
    expect(outcomeButton('no')).toBeDisabled();
    expect(outcomeButton('no')).toHaveAccessibleDescription(/can be decided only after the deadline/);
    expect(outcomeButton('no')).toHaveTextContent("Doesn't ship");
  });

  it('unlocks "no" once the deadline has passed', async () => {
    renderMarket('mine-over');
    await loaded();
    openTab('Resolution');
    expect(outcomeButton('no')).toBeEnabled();
  });

  it('asks for confirmation that says payouts are automatic and final, and sends nothing before it', async () => {
    renderMarket('mine-one');
    await loaded();
    openTab('Resolution');
    fireEvent.click(outcomeButton('yes'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Resolve as Ships?' });
    expect(dialog).toHaveTextContent('Payouts are automatic and final');
    expect(dialog).toHaveTextContent('Every Ships share pays 1 point');
    expect(dialog).toHaveTextContent('Trading stops right away');
    expect(fake.callsTo('POST', '/resolve')).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fake.callsTo('POST', '/resolve')).toHaveLength(0);
  });

  it('resolves with the note, closes the dialog, tells the creator what was paid and shows the final outcome', async () => {
    renderMarket('mine-one');
    await loaded();
    openTab('Resolution');
    fireEvent.change(within(resolvePanel()).getByLabelText(/^Note/), { target: { value: ' Live on mainnet ' } });
    fireEvent.click(outcomeButton('yes'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve as Ships' }));

    expect(await screen.findByText(/Resolved: Ships\. Paid out 0 points to 0 positions\./)).toBeInTheDocument();
    expect(fake.callsTo('POST', '/resolve')[0]?.body).toEqual({ outcome: 'yes', note: 'Live on mainnet' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(resolvePanel()).toBeNull());
    expect(document.querySelector('[data-resolution-outcome]')).toHaveTextContent('Final outcome Ships');
    expect(screen.getByText('Resolved · Ships')).toBeInTheDocument();
  });

  it('voids a market and refunds', async () => {
    renderMarket('mine-one');
    await loaded();
    openTab('Resolution');
    fireEvent.click(outcomeButton('void'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Resolve as Void?' });
    expect(dialog).toHaveTextContent('Every position is refunded at its cost.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve as Void' }));
    await waitFor(() => expect(screen.getByText('Voided: every position was refunded at cost.')).toBeInTheDocument());
  });

  it('keeps the dialog open and explains a refusal', async () => {
    renderMarket('mine-one');
    await loaded();
    openTab('Resolution');
    fake.override = (path) =>
      path.endsWith('/resolve')
        ? new Response(JSON.stringify({ error: { code: 'resolve_too_early', message: 'x' } }), { status: 409 })
        : undefined;
    fireEvent.click(outcomeButton('yes'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve as Ships' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('can be decided only after the deadline');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('lets an admin decide any outcome on a market they did not create', async () => {
    fake.isAdmin = true;
    renderMarket('sprout-staking-v2');
    await loaded();
    openTab('Resolution');
    expect(within(resolvePanel()).getByRole('heading', { name: 'Resolve as admin' })).toBeInTheDocument();
    expect(outcomeButton('no')).toBeEnabled();
    fireEvent.click(outcomeButton('no'));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: "Resolve as Doesn't ship" }),
    );
    await waitFor(() => expect(document.querySelector('[data-resolution-outcome]')).toHaveTextContent('by an admin'));
  });

  it('reports an idempotent repeat instead of pretending it paid again', async () => {
    renderMarket('mine-one');
    await loaded();
    openTab('Resolution');
    fake.override = (path) =>
      path.endsWith('/resolve')
        ? new Response(
            JSON.stringify({
              market: { ...mine, viewer: { isCreator: true, canTrade: false, canResolve: true } },
              settlement: {
                outcome: 'yes',
                method: 'creator',
                positions: 0,
                payoutPts: 0,
                resolvedAt: ISO(Date.now()),
              },
              alreadyResolved: true,
            }),
            { status: 200 },
          )
        : undefined;
    fireEvent.click(outcomeButton('yes'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Resolve as Ships' }));
    expect(await screen.findByText('Already resolved with this outcome. Nothing changed.')).toBeInTheDocument();
  });
});

describe('payout', () => {
  it('says what was paid out on a settled market instead of offering a claim', async () => {
    const winner = makeSettled('yes', { slug: 'won', statement: 'Won promise' });
    fake = new FakeApi({
      markets: [winner],
      positions: {
        won: { yesShares: 30, realizedPts: 18, claimed: true, payoutPts: 30, settledAt: ISO(Date.now() - HOUR) },
      },
    }).install();
    renderMarket('won');
    await loaded();
    const note = await waitFor(() => {
      const found = document.querySelector('[data-payout-note]');
      expect(found).toHaveTextContent('Paid out 30');
      return found;
    });
    expect(note).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Claim/ })).toBeNull();
  });

  it('says a refund on a voided market', async () => {
    const v = makeSettled('void', { slug: 'refunded', statement: 'Refunded promise' });
    fake = new FakeApi({
      markets: [v],
      positions: { refunded: { noShares: 20, claimed: true, payoutPts: 8, settledAt: ISO(Date.now() - HOUR) } },
    }).install();
    renderMarket('refunded');
    await loaded();
    await waitFor(() => expect(document.querySelector('[data-payout-note]')).toHaveTextContent('Refunded 8'));
  });

  it('says nothing was paid on the losing side', async () => {
    const lost = makeSettled('no', { slug: 'lost', statement: 'Lost promise' });
    fake = new FakeApi({
      markets: [lost],
      positions: { lost: { yesShares: 10, claimed: true, payoutPts: 0, settledAt: ISO(Date.now() - HOUR) } },
    }).install();
    renderMarket('lost');
    await loaded();
    await waitFor(() =>
      expect(document.querySelector('[data-payout-note]')).toHaveTextContent('losing side, so nothing was paid out'),
    );
  });
});

describe('share', () => {
  it('copies the short link from the market page and confirms with a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderMarket('sprout-staking-v2');
    await loaded();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Share' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.windle.fun/s/sprout-staking-v2'));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('says so when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    renderMarket('sprout-staking-v2');
    await loaded();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Share' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    expect(await screen.findByText('Could not copy the link')).toBeInTheDocument();
  });

  it('prefers the share url the api sends', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fake.add({ ...sprout, slug: 'custom', shareUrl: 'https://app.windle.fun/s/custom-short' });
    renderMarket('custom');
    await loaded();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Share' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.windle.fun/s/custom-short'));
  });

  it('offers a pre-filled post on X with the statement, odds and link', async () => {
    renderMarket('sprout-staking-v2');
    await loaded();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Share' }), { key: 'Enter' });
    const post = await screen.findByRole('menuitem', { name: /Post on X/ });
    const url = new URL(post.getAttribute('href') ?? '');
    expect(url.pathname).toBe('/intent/post');
    expect(url.searchParams.get('url')).toBe('https://app.windle.fun/s/sprout-staking-v2');
    expect(url.searchParams.get('text')).toContain('Sprout ships staking v2 to mainnet');
  });
});

describe('preferences', () => {
  it('shows the deadline as a date when settings say so', async () => {
    setPref('deadlines', 'date');
    renderMarket('sprout-staking-v2');
    await loaded();
    openTab('Resolution');
    expect(screen.getAllByText('Deadline').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-market-page] time[datetime]')).not.toBeNull();
  });
});
