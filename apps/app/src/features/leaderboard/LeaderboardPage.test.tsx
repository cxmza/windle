import { screen, waitFor, within } from '@testing-library/react';
import type { LeaderboardEntry, LeaderboardResponse } from '@windle/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWith } from '../predict/test-render';
import { FakeApi, OTHER_WALLET, WALLET } from '../predict/test-support';
import { reloadPrefs } from '../settings/prefs';
import { LeaderboardPage } from './LeaderboardPage';

const addr = (n: number) => `${String(n).padStart(2, '1')}${'A'.repeat(40)}`.slice(0, 44);

const entry = (rank: number, over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank,
  address: addr(rank),
  netWorthPts: 2000 - rank * 10,
  balancePts: 1500 - rank * 10,
  openValuePts: 500,
  pnlPts: 1000 - rank * 10,
  marketsTraded: rank,
  ...over,
});

const board = (over: Partial<LeaderboardResponse> = {}): Partial<LeaderboardResponse> => ({
  entries: [entry(1), entry(2), entry(3, { address: WALLET }), entry(4, { pnlPts: -25 })],
  me: { ...entry(3, { address: WALLET }) },
  rankedTraders: 240,
  ...over,
});

let fake: FakeApi;

beforeEach(() => {
  localStorage.clear();
  reloadPrefs();
  fake = new FakeApi({ leaderboard: board() }).install();
});

afterEach(() => vi.unstubAllGlobals());

const rows = async () => {
  await screen.findByRole('table');
  return document.querySelectorAll<HTMLElement>('[data-leaderboard-row]');
};

describe('leaderboard', () => {
  it('ranks traders by net worth with a shortened wallet, net worth and P&L', async () => {
    renderWith(<LeaderboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading the leaderboard');
    const list = await rows();
    expect(list).toHaveLength(4);
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Rank', 'Trader', 'Net worth', 'P&L', 'Markets']);

    const first = list[0] as HTMLElement;
    expect(first).toHaveTextContent('1');
    expect(first).toHaveTextContent(`${addr(1).slice(0, 4)}…${addr(1).slice(-4)}`);
    expect(first).toHaveTextContent('1,990');
    expect(first).toHaveTextContent('+990');
    expect(first.querySelector('[data-avatar]')).toHaveAttribute('aria-hidden', 'true');
    expect(list[3]).toHaveTextContent('−25');
    expect(fake.callsTo('GET', '/v1/leaderboard')).toHaveLength(1);
  });

  it('shows how many are ranked and that points are practice points', async () => {
    renderWith(<LeaderboardPage />);
    await rows();
    expect(screen.getByText(/240 ranked traders/)).toBeInTheDocument();
    expect(screen.getByText('Practice')).toBeInTheDocument();
  });

  it('highlights the viewer row and needs no sticky bar when they are inside the top 100', async () => {
    renderWith(<LeaderboardPage />);
    const list = await rows();
    const mine = [...list].find((r) => r.hasAttribute('data-me'));
    expect(mine).toBeDefined();
    expect(mine).toHaveAttribute('aria-current', 'true');
    expect(mine).toHaveTextContent('You');
    expect([...list].filter((r) => r.hasAttribute('data-me'))).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Your rank' })).toBeNull();
  });

  it('pins "your rank" when the viewer is outside the top 100', async () => {
    fake.leaderboard = {
      ...fake.leaderboard,
      ...board({ entries: [entry(1), entry(2)], me: entry(137, { address: WALLET, pnlPts: -80, netWorthPts: 920 }) }),
    };
    renderWith(<LeaderboardPage />);
    await rows();
    const sticky = screen.getByRole('region', { name: 'Your rank' });
    expect(sticky).toHaveTextContent('#137');
    expect(sticky).toHaveTextContent('Outside the top 100');
    expect(sticky).toHaveTextContent('920');
    expect(sticky).toHaveTextContent('−80');
    expect(document.querySelector('[data-leaderboard-row][data-me]')).toBeNull();
  });

  it('pins an unranked viewer with a nudge to trade', async () => {
    fake.leaderboard = {
      ...fake.leaderboard,
      ...board({
        entries: [entry(1)],
        me: { ...entry(1, { address: WALLET, netWorthPts: 1000, pnlPts: 0 }), rank: null },
      }),
    };
    renderWith(<LeaderboardPage />);
    await rows();
    const sticky = screen.getByRole('region', { name: 'Your rank' });
    expect(sticky).toHaveTextContent('—');
    expect(sticky).toHaveTextContent('Make a trade to get on the board.');
  });

  it('shows no sticky bar and no highlight for an anonymous caller', async () => {
    fake.leaderboard = { ...fake.leaderboard, ...board({ me: null }) };
    renderWith(<LeaderboardPage />);
    await rows();
    expect(screen.queryByRole('region', { name: 'Your rank' })).toBeNull();
    expect(document.querySelector('[data-me]')).toBeNull();
  });

  it('is an intentional empty state when nobody has traded', async () => {
    fake.leaderboard = { ...fake.leaderboard, entries: [], me: null, rankedTraders: 0 };
    renderWith(<LeaderboardPage />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Nobody is ranked yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the retry banner when the api fails, and recovers', async () => {
    fake.failNext = new Response('{}', { status: 503 });
    renderWith(<LeaderboardPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('windle is having trouble');
    alert.querySelector('button')?.click();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });

  it('refreshes on its own while the tab is visible', async () => {
    const { client } = renderWith(<LeaderboardPage />);
    await rows();
    fake.leaderboard = { ...fake.leaderboard, entries: [entry(1, { address: OTHER_WALLET, netWorthPts: 5000 })] };
    await client.invalidateQueries({ queryKey: ['predict', 'leaderboard'] });
    await waitFor(() => expect(document.querySelectorAll('[data-leaderboard-row]')).toHaveLength(1));
    expect(screen.getByRole('table')).toHaveTextContent('5,000');
  });
});
