import type { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBalance, useCandles, useMarkets, usePredictActions } from './hooks';
import {
  CANDLES_POLL_MS,
  candlesQuery,
  leaderboardQuery,
  marketQuery,
  marketsQuery,
  POLL_MS,
  portfolioQuery,
  predictKeys,
} from './queries';
import { newClient, Providers } from './test-render';
import { FakeApi, ISO, makeMarket, makeSettled, WALLET } from './test-support';

const open = makeMarket({ slug: 'open-one', prob: 0.5 });
const mine = makeMarket({ slug: 'mine-one', creator: WALLET });
const closing = makeMarket({ slug: 'closing-one', deadline: ISO(Date.now() + 60_000) });

let fake: FakeApi;
let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => <Providers client={client}>{children}</Providers>;

beforeEach(() => {
  client = newClient();
  fake = new FakeApi({ markets: [open, mine, closing, makeSettled('yes', { slug: 'done' })] }).install();
});

afterEach(() => vi.unstubAllGlobals());

/** Warms every query a trade or a resolution must refresh, then reports which of them went stale. */
async function warm(slug: string) {
  await client.fetchInfiniteQuery(marketsQuery({ status: 'open', sort: 'closing' }, false));
  await client.fetchQuery(marketQuery(slug));
  await client.fetchQuery(portfolioQuery());
  await client.fetchQuery(leaderboardQuery());
}

const staleKeys = () =>
  [
    predictKeys.markets({ status: 'open', sort: 'closing' }),
    predictKeys.market('open-one'),
    predictKeys.market('mine-one'),
    predictKeys.portfolio,
    predictKeys.leaderboard,
  ].filter((key) => client.getQueryState(key)?.isInvalidated);

describe('queries poll modestly', () => {
  it('re-asks every few seconds, and the list only when asked to', () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(5_000);
    expect(POLL_MS).toBeLessThanOrEqual(10_000);
    expect(marketsQuery({}, true).refetchInterval).toBe(POLL_MS);
    expect(marketsQuery({}, false).refetchInterval).toBe(false);
    expect(leaderboardQuery().refetchInterval).toBe(POLL_MS);
    expect(portfolioQuery(true).refetchInterval).toBe(POLL_MS);
    expect(portfolioQuery().refetchInterval).toBe(false);
  });

  it('keeps polling an open market and stops once it is settled', () => {
    const interval = marketQuery('x').refetchInterval;
    if (typeof interval !== 'function') throw new Error('expected a function');
    const intervalFor = (status: string) =>
      interval({ state: { data: { market: { status } } } } as unknown as Parameters<typeof interval>[0]);
    expect(intervalFor('open')).toBe(POLL_MS);
    expect(intervalFor('closed')).toBe(POLL_MS);
    expect(intervalFor('resolved')).toBe(false);
    expect(intervalFor('voided')).toBe(false);
  });
});

describe('usePredictActions', () => {
  it('after a buy, writes the new balance and position and marks market, list, portfolio and leaderboard stale', async () => {
    await warm('open-one');
    const { result } = renderHook(() => usePredictActions(), { wrapper });
    await act(async () => {
      await result.current.buy.mutateAsync({ market: open, side: 'yes', amountPts: 100 });
    });
    expect(client.getQueryData<{ balancePts: number }>(predictKeys.portfolio)?.balancePts).toBe(900);
    const detail = client.getQueryData<{ position: { yesShares: number } | null; market: { volumePts: number } }>(
      predictKeys.market('open-one'),
    );
    expect(detail?.position?.yesShares).toBeGreaterThan(0);
    expect(detail?.market.volumePts).toBe(100);
    expect(staleKeys()).toEqual(
      expect.arrayContaining([
        predictKeys.markets({ status: 'open', sort: 'closing' }),
        predictKeys.market('open-one'),
        predictKeys.portfolio,
        predictKeys.leaderboard,
      ]),
    );
  });

  it('sends a buy with minShares below the quote, and a sell with minProceedsPts', async () => {
    const { result } = renderHook(() => usePredictActions(), { wrapper });
    await act(async () => {
      await result.current.buy.mutateAsync({ market: open, side: 'yes', amountPts: 100 });
    });
    const held = fake.positions.get('open-one')?.yesShares ?? 0;
    const fresh = fake.markets.get('open-one') ?? open;
    await act(async () => {
      await result.current.sell.mutateAsync({ market: fresh, side: 'yes', shares: held, owned: held });
    });
    const [buy, sell] = fake.callsTo('POST', '/trades').map((c) => c.body as Record<string, number>);
    expect(buy?.minShares).toBeGreaterThan(0);
    expect(sell?.minProceedsPts).toBeGreaterThan(0);
    expect(sell?.shares).toBe(held);
  });

  it('after a resolution, puts the settled market in the cache and marks everything stale', async () => {
    await warm('mine-one');
    const { result } = renderHook(() => usePredictActions(), { wrapper });
    await act(async () => {
      await result.current.resolve.mutateAsync({ slug: 'mine-one', outcome: 'void', note: 'cancelled' });
    });
    const detail = client.getQueryData<{ market: { status: string; viewer?: { canResolve: boolean } } }>(
      predictKeys.market('mine-one'),
    );
    expect(detail?.market.status).toBe('voided');
    expect(detail?.market.viewer?.canResolve).toBe(false);
    expect(fake.callsTo('POST', '/resolve')[0]?.body).toEqual({ outcome: 'void', note: 'cancelled' });
    expect(staleKeys()).toEqual(
      expect.arrayContaining([predictKeys.portfolio, predictKeys.leaderboard, predictKeys.market('mine-one')]),
    );
  });

  it('rejects with the api error so the screens can map its code', async () => {
    const { result } = renderHook(() => usePredictActions(), { wrapper });
    await expect(
      act(async () => {
        await result.current.buy.mutateAsync({ market: mine, side: 'yes', amountPts: 10 });
      }),
    ).rejects.toMatchObject({ code: 'creator_cannot_trade', status: 403 });
  });
});

describe('reads', () => {
  it('flattens pages and reports the total, so the list can offer more', async () => {
    const many = Array.from({ length: 103 }, (_, i) =>
      makeMarket({ slug: `p-${i}`, deadline: ISO(Date.now() + (i + 1) * 60_000) }),
    );
    fake = new FakeApi({ markets: many }).install();
    const { result } = renderHook(() => useMarkets({ status: 'open', sort: 'closing' }), { wrapper });
    await waitFor(() => expect(result.current.markets).toHaveLength(100));
    expect(result.current.total).toBe(103);
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.markets).toHaveLength(103));
    expect(result.current.hasMore).toBe(false);
  });

  it('knows the balance only once the portfolio is in', async () => {
    const { result } = renderHook(() => useBalance(), { wrapper });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(1000));
  });
});

describe('candles', () => {
  it('polls every few seconds while the market trades and stops once it does not', () => {
    expect(CANDLES_POLL_MS).toBeLessThanOrEqual(5_000);
    expect(candlesQuery('x', '5m', 'yes', true).refetchInterval).toBe(CANDLES_POLL_MS);
    expect(candlesQuery('x', '5m', 'yes', false).refetchInterval).toBe(false);
  });

  it('asks for one timeframe and side, and validates the answer against the contract', async () => {
    const { result } = renderHook(() => useCandles('open-one', '15m', 'no', false), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const call = fake.callsTo('GET', '/candles')[0];
    expect(call?.path).toBe('/v1/markets/open-one/candles');
    expect(call?.query.get('tf')).toBe('15m');
    expect(call?.query.get('side')).toBe('no');
    expect(result.current.data?.tf).toBe('15m');
    expect(result.current.data?.side).toBe('no');
    expect(result.current.data?.candles.at(-1)?.c).toBeCloseTo(0.5);
  });

  it('keeps the previous candles on screen while another timeframe loads', async () => {
    const { result, rerender } = renderHook(({ tf }) => useCandles('open-one', tf, 'yes', false), {
      wrapper,
      initialProps: { tf: '5m' as '5m' | '1h' },
    });
    await waitFor(() => expect(result.current.data?.tf).toBe('5m'));
    rerender({ tf: '1h' });
    expect(result.current.data?.tf).toBe('5m');
    expect(result.current.isPlaceholderData).toBe(true);
    await waitFor(() => expect(result.current.data?.tf).toBe('1h'));
  });

  it('fails with the api error when the candles cannot load', async () => {
    fake.override = (path) => (path.endsWith('/candles') ? new Response('{}', { status: 503 }) : undefined);
    const { result } = renderHook(() => useCandles('open-one', '5m', 'yes', false), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
