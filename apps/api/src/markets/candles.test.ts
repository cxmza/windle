import type { CandleTimeframe, TradeRequest, TweetSnapshot } from '@windle/shared';
import { describe, expect, it } from 'vitest';
import { buildCandles, candlesForSide, candleWindow } from './candles.ts';
import { MemoryMarketRepository } from './memory.ts';
import { executeTrade, insertMarket } from './service.ts';
import { marketStats } from './stats.ts';
import type { MarketRecord, MarketRepository } from './types.ts';

const T0 = Date.parse('2026-10-17T12:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const CREATOR = { userId: 'creator-0000', address: 'Creator1111111111111111111111111111111111111' };

function source(id: string): TweetSnapshot {
  return {
    id,
    url: `https://x.com/sproutfi_dev/status/${id}`,
    author: { handle: 'sproutfi_dev', name: 'Sprout' },
    text: 'staking v2 ships friday',
    createdAt: '2026-10-17T10:00:00.000Z',
    capturedAt: '2026-10-17T11:00:00.000Z',
  };
}

async function market(repo: MarketRepository, closesInMs = 48 * HOUR, id = '1846811200000030001') {
  const { market: m } = await insertMarket(
    repo,
    {
      statement: `Candle market ${id}`,
      criteria: 'YES if it happens before the deadline.',
      deadline: new Date(T0 + closesInMs).toISOString(),
      tier: 'community',
      project: { name: 'Sproutfi', ticker: 'SPRT' },
      initialProbYes: 0.5,
      liquidityB: 100,
      source: source(id),
    },
    CREATOR,
    new Date(T0),
  );
  return m;
}

async function trade(
  repo: MarketRepository,
  m: MarketRecord,
  atMs: number,
  who: string,
  request: TradeRequest,
  bot = false,
) {
  const done = await executeTrade(repo, {
    slug: m.slug,
    userId: who,
    walletAddress: `${who}111111111111111111111111111111111`.slice(0, 44),
    request,
    now: new Date(atMs),
    bot,
  });
  return done.trade;
}

async function candles(repo: MarketRepository, slug: string, tf: CandleTimeframe, limit: number, nowMs: number) {
  const m = await repo.marketBySlug(slug);
  if (!m) throw new Error('market vanished');
  const window = candleWindow(m, tf, limit, new Date(nowMs));
  const { before, buckets } = await repo.tradeBuckets(m.id, window);
  return { window, candles: buildCandles(m, window, before, buckets) };
}

/** Three trades in the first minute, nothing in the second, one bot trade in the third. */
async function sequence() {
  const repo = new MemoryMarketRepository();
  const m = await market(repo);
  const t1 = await trade(repo, m, T0 + 10_000, 'alice', { action: 'buy', side: 'yes', amountPts: 20 });
  const t2 = await trade(repo, m, T0 + 30_000, 'bob', { action: 'buy', side: 'no', amountPts: 40 });
  const t3 = await trade(repo, m, T0 + 50_000, 'alice', { action: 'sell', side: 'yes', shares: t1.shares / 2 });
  const t4 = await trade(
    repo,
    m,
    T0 + 2 * MIN + 5000,
    'MarketBot1',
    { action: 'buy', side: 'yes', amountPts: 7 },
    true,
  );
  return { repo, m, t1, t2, t3, t4, now: T0 + 3 * MIN + 20_000 };
}

describe('candles', () => {
  it('buckets trades into OHLC with volume, bot share and gap-filled flat candles', async () => {
    const { repo, m, t1, t2, t3, t4, now } = await sequence();
    const { window, candles: out } = await candles(repo, m.slug, '1m', 300, now);
    const sec = T0 / 1000;
    expect(window).toMatchObject({ fromSec: sec, lastSec: sec + 180, endSec: sec + 200 });
    expect(out.map((c) => c.t)).toEqual([sec, sec + 60, sec + 120, sec + 180]);
    const [first, gap, botCandle, last] = out;
    expect(first).toEqual({
      t: sec,
      o: 0.5,
      h: Math.max(0.5, t1.priceAfter, t2.priceAfter, t3.priceAfter),
      l: Math.min(0.5, t1.priceAfter, t2.priceAfter, t3.priceAfter),
      c: t3.priceAfter,
      v: (t1.costMicro + t2.costMicro + t3.costMicro) / 1e6,
      vBot: 0,
      n: 3,
      nBot: 0,
    });
    expect(first?.h).toBe(t1.priceAfter);
    expect(first?.l).toBe(t3.priceAfter);
    const flat = t3.priceAfter;
    expect(gap).toEqual({ t: sec + 60, o: flat, h: flat, l: flat, c: flat, v: 0, vBot: 0, n: 0, nBot: 0 });
    expect(botCandle).toMatchObject({ o: flat, c: t4.priceAfter, v: 7, vBot: 7, n: 1, nBot: 1 });
    expect(botCandle?.h).toBe(Math.max(flat, t4.priceAfter));
    expect(last).toMatchObject({ o: t4.priceAfter, c: t4.priceAfter, n: 0 });
  });

  it('merges buckets on a longer timeframe', async () => {
    const { repo, m, t1, t4, now } = await sequence();
    const { candles: out } = await candles(repo, m.slug, '5m', 300, now);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ t: T0 / 1000, o: 0.5, c: t4.priceAfter, h: t1.priceAfter, n: 4, nBot: 1 });
  });

  it('returns only the most recent `limit` buckets, opening at the price before the window', async () => {
    const { repo, m, t3, t4, now } = await sequence();
    const { window, candles: out } = await candles(repo, m.slug, '1m', 2, now);
    expect(window.fromSec).toBe(T0 / 1000 + 120);
    expect(out.map((c) => c.t)).toEqual([T0 / 1000 + 120, T0 / 1000 + 180]);
    expect(out[0]).toMatchObject({ o: t3.priceAfter, c: t4.priceAfter, n: 1 });
    const one = await candles(repo, m.slug, '1m', 1, now);
    expect(one.candles).toEqual([expect.objectContaining({ t: T0 / 1000 + 180, o: t4.priceAfter, n: 0 })]);
  });

  it('inverts every price for side=no, swapping high and low', async () => {
    const { repo, m, now } = await sequence();
    const { candles: yes } = await candles(repo, m.slug, '1m', 300, now);
    const no = candlesForSide(yes, 'no');
    for (const [i, c] of no.entries()) {
      const y = yes[i];
      if (!y) throw new Error('length mismatch');
      expect(c.o).toBeCloseTo(1 - y.o, 12);
      expect(c.c).toBeCloseTo(1 - y.c, 12);
      expect(c.h).toBeCloseTo(1 - y.l, 12);
      expect(c.l).toBeCloseTo(1 - y.h, 12);
      expect(c.h).toBeGreaterThanOrEqual(c.l);
      expect({ v: c.v, n: c.n, t: c.t }).toEqual({ v: y.v, n: y.n, t: y.t });
    }
  });

  it('stops at the close of a closed market and starts at the opening price without trades', async () => {
    const repo = new MemoryMarketRepository();
    const flash = await market(repo, 15 * MIN, '1846811200000030002');
    const late = await candles(repo, flash.slug, '5m', 300, T0 + 5 * HOUR);
    expect(late.window.endSec).toBe((T0 + 15 * MIN) / 1000);
    expect(late.candles.map((c) => c.t)).toEqual([0, 300, 600].map((d) => T0 / 1000 + d));
    expect(late.candles.every((c) => c.o === 0.5 && c.c === 0.5 && c.n === 0)).toBe(true);
    const fresh = await candles(repo, flash.slug, '1d', 300, T0);
    expect(fresh.candles).toHaveLength(1);
    expect(fresh.candles[0]?.t).toBe(Math.floor(T0 / 86_400_000) * 86_400);
  });

  it('computes buys, sells and the 24-hour change in one pass', async () => {
    const { repo, m, t4, now } = await sequence();
    const fresh = await market(repo, 48 * HOUR, '1846811200000030003');
    const rec = await repo.marketBySlug(m.slug);
    if (!rec) throw new Error('market vanished');
    const young = await marketStats(repo, [rec, fresh], new Date(now));
    expect(young.get(m.id)).toEqual({
      change24hPp: (t4.priceAfter - 0.5) * 100,
      buys: 3,
      sells: 1,
      botTrades: 1,
      humanTraders: 2,
    });
    expect(young.get(fresh.id)?.change24hPp).toBeNull();

    const nextDay = T0 + 24 * HOUR + 2 * MIN;
    const t5 = await trade(repo, rec, nextDay, 'carol', { action: 'buy', side: 'no', amountPts: 30 });
    const after = await repo.marketBySlug(m.slug);
    if (!after) throw new Error('market vanished');
    const stats = await marketStats(repo, [after], new Date(nextDay + 30_000));
    expect(stats.get(m.id)?.change24hPp).toBeCloseTo((t5.priceAfter - t4.priceAfter) * 100, 12);
    expect(stats.get(m.id)).toMatchObject({ buys: 4, sells: 1, humanTraders: 3 });
  });
});
