import type { MarketStats } from '@windle/shared';
import type { MarketRecord, MarketRepository } from './types.ts';

const DAY_MS = 86_400_000;

/** Stats for a page of markets in one query: only markets older than a day need a price from 24 hours ago. */
export async function marketStats(
  repo: MarketRepository,
  markets: readonly MarketRecord[],
  now: Date,
): Promise<Map<string, MarketStats>> {
  const cutoff = new Date(now.getTime() - DAY_MS);
  const older = markets.filter((m) => m.tradeCount > 0 && m.createdAt.getTime() <= cutoff.getTime()).map((m) => m.id);
  const dayAgo = older.length > 0 ? await repo.pricesAt(older, cutoff) : new Map<string, number>();
  return new Map(
    markets.map((m) => {
      const ref = dayAgo.get(m.id) ?? m.openProbYes;
      return [
        m.id,
        {
          change24hPp: m.tradeCount > 0 ? (m.probYes - ref) * 100 : null,
          buys: m.buyCount,
          sells: m.tradeCount - m.buyCount,
          botTrades: m.botTradeCount,
          humanTraders: m.traders,
        },
      ];
    }),
  );
}
