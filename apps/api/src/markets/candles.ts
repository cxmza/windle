import { CANDLE_TIMEFRAME_SECONDS, type Candle, type CandleTimeframe, type MarketSide } from '@windle/shared';
import { fromMicro } from './engine.ts';
import type { BucketRange, MarketRecord, TradeBucket, TradeRecord } from './types.ts';

export interface CandleWindow extends BucketRange {
  /** Start of the last bucket, Unix seconds. */
  lastSec: number;
  /** End of the data (now, or when trading stopped), Unix seconds. */
  endSec: number;
}

export const bucketStart = (sec: number, stepSec: number): number => Math.floor(sec / stepSec) * stepSec;

/**
 * The `limit` most recent buckets of the market's trading life: from its creation to now, or to its close (or an
 * earlier resolution) once trading has stopped.
 */
export function candleWindow(m: MarketRecord, tf: CandleTimeframe, limit: number, now: Date): CandleWindow {
  const stepSec = CANDLE_TIMEFRAME_SECONDS[tf];
  const createdMs = m.createdAt.getTime();
  const closesMs = m.closesAt.getTime();
  const stopMs = Math.min(closesMs, m.resolvedAt?.getTime() ?? Number.POSITIVE_INFINITY);
  const endMs = Math.max(createdMs, Math.min(now.getTime(), stopMs));
  // Nothing trades at the closing instant itself, so a close on a bucket boundary does not open one more bucket.
  const lastMs = endMs === closesMs && endMs > createdMs ? endMs - 1 : endMs;
  const endSec = Math.floor(endMs / 1000);
  const firstSec = bucketStart(Math.floor(createdMs / 1000), stepSec);
  const lastSec = bucketStart(Math.floor(lastMs / 1000), stepSec);
  const fromSec = Math.max(firstSec, lastSec - (limit - 1) * stepSec);
  return { stepSec, fromSec, toSec: lastSec + stepSec, lastSec, endSec };
}

/** The memory repository's bucketing; Postgres does the same in SQL (markets/postgres.ts). Trades in id order. */
export function bucketTrades(
  trades: readonly TradeRecord[],
  range: BucketRange,
): { before: number | null; buckets: TradeBucket[] } {
  let before: number | null = null;
  const buckets = new Map<number, TradeBucket>();
  for (const trade of trades) {
    const sec = trade.createdAt.getTime() / 1000;
    if (sec < range.fromSec) {
      before = trade.priceAfter;
      continue;
    }
    if (sec >= range.toSec) continue;
    const t = bucketStart(sec, range.stepSec);
    const p = trade.priceAfter;
    const b = buckets.get(t);
    if (!b) {
      buckets.set(t, {
        t,
        h: p,
        l: p,
        c: p,
        volumeMicro: trade.costMicro,
        botVolumeMicro: trade.bot ? trade.costMicro : 0,
        n: 1,
        nBot: trade.bot ? 1 : 0,
      });
      continue;
    }
    b.h = Math.max(b.h, p);
    b.l = Math.min(b.l, p);
    b.c = p;
    b.volumeMicro += trade.costMicro;
    b.n += 1;
    if (trade.bot) {
      b.botVolumeMicro += trade.costMicro;
      b.nBot += 1;
    }
  }
  return { before, buckets: [...buckets.values()].sort((a, b) => a.t - b.t) };
}

/**
 * YES candles over `window`, one per bucket: each opens at the previous close (the first at the price before the
 * window, or the market's opening price), and a bucket without trades is a flat candle at that price.
 */
export function buildCandles(
  m: MarketRecord,
  window: CandleWindow,
  before: number | null,
  buckets: readonly TradeBucket[],
): Candle[] {
  const byStart = new Map(buckets.map((b) => [b.t, b]));
  const out: Candle[] = [];
  let prev = before ?? m.openProbYes;
  for (let t = window.fromSec; t <= window.lastSec; t += window.stepSec) {
    const b = byStart.get(t);
    const candle: Candle = b
      ? {
          t,
          o: prev,
          h: Math.max(prev, b.h),
          l: Math.min(prev, b.l),
          c: b.c,
          v: fromMicro(b.volumeMicro),
          vBot: fromMicro(b.botVolumeMicro),
          n: b.n,
          nBot: b.nBot,
        }
      : { t, o: prev, h: prev, l: prev, c: prev, v: 0, vBot: 0, n: 0, nBot: 0 };
    out.push(candle);
    prev = candle.c;
  }
  return out;
}

export function candlesForSide(candles: readonly Candle[], side: MarketSide): Candle[] {
  if (side === 'yes') return [...candles];
  return candles.map((c) => ({ ...c, o: 1 - c.o, h: 1 - c.l, l: 1 - c.h, c: 1 - c.c }));
}
