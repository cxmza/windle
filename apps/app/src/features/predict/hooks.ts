import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiMarket,
  ApiPortfolio,
  ApiPosition,
  ApiTrade,
  BuyQuote,
  CandleTimeframe,
  CreateMarketRequest,
  MarketDetailResponse,
  MarketSide,
  ProposedOutcome,
  SellQuote,
} from '@windle/shared';
import { sessionQuery } from '../session/queries';
import { marketsApi } from './api';
import {
  candlesQuery,
  leaderboardQuery,
  type MarketsQuery,
  marketQuery,
  marketsQuery,
  portfolioQuery,
  predictKeys,
} from './queries';
import { buildPortfolio } from './selectors';
import { buyGuard, previewBuy, previewSell, type QuoteProblem, sellAmount, sellGuard } from './trading';
import { lookupTweetByUrl } from './tweets';
import { unwrap } from './types';

export interface MarketsResult {
  markets: readonly ApiMarket[];
  total: number;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
}

const NO_MARKETS: readonly ApiMarket[] = [];

/** One page of 100 at a time. `poll` keeps the list fresh while the tab is visible. */
export function useMarkets(query: MarketsQuery = {}, { poll = false }: { poll?: boolean } = {}): MarketsResult {
  const q = useInfiniteQuery(marketsQuery(query, poll));
  const pages = q.data?.pages;
  return {
    markets: pages ? pages.flatMap((p) => p.markets) : NO_MARKETS,
    total: pages?.[0]?.total ?? 0,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: () => void q.refetch(),
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
    loadingMore: q.isFetchingNextPage,
  };
}

/** The market page's single source: market, recent trades, price history and the viewer's position, polled. */
export function useMarketDetail(slug: string) {
  return useQuery(marketQuery(slug));
}

const NO_POINTS: MarketDetailResponse['history'] = [];
const NO_TRADES: readonly ApiTrade[] = [];

export function usePriceHistory(slug: string) {
  return useQuery({ ...marketQuery(slug), select: (d) => d.history }).data ?? NO_POINTS;
}

export function useTrades(slug: string, limit = 50): readonly ApiTrade[] {
  const trades = useQuery({ ...marketQuery(slug), select: (d) => d.trades }).data ?? NO_TRADES;
  return trades.length > limit ? trades.slice(0, limit) : trades;
}

/** OHLC candles of one side. They poll every few seconds while `live`; the previous timeframe stays up while a new one loads. */
export function useCandles(slug: string, tf: CandleTimeframe, side: MarketSide, live: boolean) {
  return useQuery(candlesQuery(slug, tf, side, live));
}

export function usePosition(slug: string): ApiPosition | null {
  return useQuery({ ...marketQuery(slug), select: (d) => d.position }).data ?? null;
}

export function usePortfolio({ poll = false }: { poll?: boolean } = {}) {
  return useQuery({ ...portfolioQuery(poll), select: buildPortfolio });
}

/** Spendable points; null until the portfolio has loaded. */
export function useBalance(): number | null {
  return useQuery({ ...portfolioQuery(), select: (p) => p.balancePts }).data ?? null;
}

export function useLeaderboard() {
  return useQuery(leaderboardQuery());
}

/** The wallet the session was started with; null while the session loads. */
export function useMyAddress(): string | null {
  const session = useQuery(sessionQuery()).data;
  return session?.authenticated ? session.address : null;
}

export interface BuyQuoteView {
  quote: BuyQuote | null;
  problem: QuoteProblem | null;
  balanceAfterPts: number | null;
}

export interface SellQuoteView {
  quote: SellQuote | null;
  problem: QuoteProblem | null;
}

export function useQuote(market: ApiMarket, side: MarketSide, amountPts: number): BuyQuoteView {
  const balance = useBalance();
  const { quote, problem } = previewBuy(market, balance, side, amountPts);
  return { quote, problem, balanceAfterPts: quote && balance !== null ? balance - amountPts : null };
}

export function useSellQuote(market: ApiMarket, side: MarketSide, shares: number): SellQuoteView {
  const position = usePosition(market.slug);
  const owned = side === 'yes' ? (position?.yesShares ?? 0) : (position?.noShares ?? 0);
  return previewSell(market, owned, side, shares);
}

export interface BuyVars {
  market: ApiMarket;
  side: MarketSide;
  amountPts: number;
}

export interface SellVars {
  market: ApiMarket;
  side: MarketSide;
  shares: number;
  owned: number;
}

export interface ResolveVars {
  slug: string;
  outcome: ProposedOutcome;
  note?: string;
}

/**
 * Mutations over the exchange. They reject with ApiRequestError (`code`, `details`); map it with `errorMessage`.
 * A trade answers with the new market, position and balance, which go into the cache at once; then every predict
 * query (market, lists, portfolio, leaderboard) is marked stale and the visible ones refetch.
 */
export function usePredictActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: predictKeys.all });

  const applyTrade = (slug: string, res: { market: ApiMarket; position: ApiPosition; balancePts: number }) => {
    client.setQueryData(predictKeys.market(slug), (old: MarketDetailResponse | undefined) =>
      old ? { ...old, market: res.market, position: res.position } : old,
    );
    client.setQueryData(predictKeys.portfolio, (old: ApiPortfolio | undefined) =>
      old ? { ...old, balancePts: res.balancePts } : old,
    );
    return refresh();
  };

  return {
    buy: useMutation({
      mutationFn: (v: BuyVars) =>
        marketsApi.trade(v.market.slug, {
          action: 'buy',
          side: v.side,
          amountPts: v.amountPts,
          ...buyGuard(v.market, v.side, v.amountPts),
        }),
      onSuccess: (res, v) => applyTrade(v.market.slug, res),
    }),
    sell: useMutation({
      mutationFn: (v: SellVars) => {
        const shares = sellAmount(v.shares, v.owned);
        return marketsApi.trade(v.market.slug, {
          action: 'sell',
          side: v.side,
          shares,
          ...sellGuard(v.market, v.side, shares),
        });
      },
      onSuccess: (res, v) => applyTrade(v.market.slug, res),
    }),
    resolve: useMutation({
      mutationFn: (v: ResolveVars) =>
        marketsApi.resolve(v.slug, { outcome: v.outcome, ...(v.note ? { note: v.note } : {}) }),
      onSuccess: (res, v) => {
        client.setQueryData(predictKeys.market(v.slug), (old: MarketDetailResponse | undefined) =>
          old ? { ...old, market: res.market } : old,
        );
        return refresh();
      },
    }),
    createMarket: useMutation({
      mutationFn: async (request: CreateMarketRequest): Promise<ApiMarket> => (await marketsApi.create(request)).market,
      onSuccess: refresh,
    }),
  };
}

/** Wizard step 1: paste a tweet link, get the snapshot (or a typed error) back. */
export function useTweetPreview() {
  return useMutation({
    mutationFn: async (url: string) => unwrap(await lookupTweetByUrl(url)),
  });
}
