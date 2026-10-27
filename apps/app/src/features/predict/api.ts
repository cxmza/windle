import {
  ApiPortfolio,
  CandlesResponse,
  type CandleTimeframe,
  type CreateMarketRequest,
  CreateMarketResponse,
  LeaderboardResponse,
  MarketDetailResponse,
  type MarketListQuery,
  MarketListResponse,
  type MarketSide,
  type ResolveRequest,
  ResolveResponse,
  type TradeRequest,
  TradeResponse,
} from '@windle/shared';
import { http } from '@/lib/api';

const slugPath = (slug: string): string => `/v1/markets/${encodeURIComponent(slug)}`;

function listPath(query: MarketListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return `/v1/markets${text ? `?${text}` : ''}`;
}

/** The exchange endpoints, typed. Every response is validated against its @windle/shared schema. */
export const marketsApi = {
  list: (query: MarketListQuery, signal?: AbortSignal) => http.get(listPath(query), MarketListResponse, signal),
  detail: (slug: string, signal?: AbortSignal) => http.get(slugPath(slug), MarketDetailResponse, signal),
  candles: (slug: string, tf: CandleTimeframe, side: MarketSide, signal?: AbortSignal) =>
    http.get(`${slugPath(slug)}/candles?tf=${tf}&side=${side}`, CandlesResponse, signal),
  create: (request: CreateMarketRequest) => http.post('/v1/markets', request, CreateMarketResponse),
  trade: (slug: string, request: TradeRequest) => http.post(`${slugPath(slug)}/trades`, request, TradeResponse),
  resolve: (slug: string, request: ResolveRequest) => http.post(`${slugPath(slug)}/resolve`, request, ResolveResponse),
  portfolio: (signal?: AbortSignal) => http.get('/v1/me/portfolio', ApiPortfolio, signal),
  leaderboard: (signal?: AbortSignal) => http.get('/v1/leaderboard', LeaderboardResponse, signal),
};
