import {
  inventoryForPrice,
  LeaderboardResponse,
  lmsrPriceYes,
  MarketDetailResponse,
  quote,
  TradeResponse,
  type TweetSnapshot,
} from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { BotsConfig } from '../../config.ts';
import { MemoryEphemeralStore } from '../../store/memory.ts';
import { APP_ORIGIN, makeTestApp, signIn } from '../../test/helpers.ts';
import { MemoryMarketRepository } from '../memory.ts';
import { executeTrade, insertMarket, resolveMarket } from '../service.ts';
import type { BotState } from '../types.ts';
import { marketBot } from './identity.ts';
import {
  advance,
  followHumanTrade,
  gaussian,
  initialState,
  logit,
  ouMoments,
  planBotTrade,
  seededRng,
  type TradeCaps,
} from './model.ts';
import { MarketBots, quietWindowMs } from './runner.ts';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');
const HOUR = 3_600_000;
const CREATOR = { userId: 'creator-0000', address: 'Creator1111111111111111111111111111111111111' };
const ALICE = { userId: 'alice-000000', walletAddress: 'A1ice111111111111111111111111111111111111111' };
const CAPS: TradeCaps = { maxStakePts: 25, maxStep: 0.03, deadBand: 0.01 };

const CONFIG: BotsConfig = {
  enabled: true,
  tickMs: 20_000,
  thetaPerHour: 2,
  sigma: 3,
  anchorAlpha: 0.5,
  anchorFollowPerHour: 1,
  maxStakePts: 25,
  maxStep: 0.03,
  deadBand: 0.01,
  count: 4,
  marketsPerTick: 10,
  quietBeforeCloseMs: 30 * 60_000,
};

const silent = { debug: () => {}, info: () => {}, warn: () => {} };

let tweetSeq = 0;
function source(): TweetSnapshot {
  tweetSeq += 1;
  const id = `18468112000000${String(20_000 + tweetSeq)}`;
  return {
    id,
    url: `https://x.com/sproutfi_dev/status/${id}`,
    author: { handle: 'sproutfi_dev', name: 'Sprout' },
    text: 'staking v2 ships friday',
    createdAt: '2026-10-17T10:00:00.000Z',
    capturedAt: '2026-10-17T11:00:00.000Z',
  };
}

async function addMarket(
  repo: MemoryMarketRepository,
  statement: string,
  closesInHours = 48,
  prob = 0.5,
  createdHoursAgo = 0,
) {
  const { market } = await insertMarket(
    repo,
    {
      statement,
      criteria: 'YES if it happens before the deadline.',
      deadline: new Date(NOW + closesInHours * HOUR).toISOString(),
      tier: 'community',
      project: { name: 'Sproutfi', ticker: 'SPRT' },
      initialProbYes: prob,
      liquidityB: 100,
      source: source(),
    },
    CREATOR,
    new Date(NOW - createdHoursAgo * HOUR),
  );
  return market;
}

function runner(repo: MemoryMarketRepository, clock: { now: number }, opts: { owner?: string; seed?: number } = {}) {
  const store = new MemoryEphemeralStore(() => clock.now);
  return {
    store,
    bots: new MarketBots({
      repo,
      store,
      config: CONFIG,
      now: () => new Date(clock.now),
      log: silent,
      rng: seededRng(opts.seed ?? 7),
      owner: opts.owner ?? 'instance-a',
    }),
  };
}

/** Ticks every `stepMs` for `ticks` ticks and collects every bot trade. */
async function run(bots: MarketBots, clock: { now: number }, ticks: number, stepMs = 10 * 60_000) {
  const trades = [];
  for (let i = 0; i < ticks; i++) {
    const r = await bots.tick();
    trades.push(...r.trades);
    clock.now += stepMs;
  }
  return trades;
}

describe('OU model', () => {
  const params = { thetaPerHour: 2, sigma: 0.25, anchorFollowPerHour: 0 };

  it('has the exact transition moments', () => {
    const { mean, variance } = ouMoments(1, 0, 0.5, params);
    expect(mean).toBeCloseTo(Math.exp(-1), 12);
    expect(variance).toBeCloseTo((0.0625 * (1 - Math.exp(-2))) / 4, 12);
    const far = ouMoments(1, 0, 1_000, params);
    expect(far.mean).toBeCloseTo(0, 12);
    expect(far.variance).toBeCloseTo(0.0625 / 4, 12);
  });

  it('samples x with that mean and variance', () => {
    const rng = seededRng(42);
    const start: BotState = { marketId: 'm', x: 1, mu: 0, humanX: 0, steppedAt: new Date(NOW) };
    const at = new Date(NOW + HOUR / 2);
    const n = 40_000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const x = advance(start, at, params, rng).x;
      sum += x;
      sq += x * x;
    }
    const mean = sum / n;
    const variance = sq / n - mean * mean;
    const want = ouMoments(1, 0, 0.5, params);
    expect(Math.abs(mean - want.mean)).toBeLessThan(4 * Math.sqrt(want.variance / n));
    expect(variance / want.variance).toBeGreaterThan(0.97);
    expect(variance / want.variance).toBeLessThan(1.03);
  });

  it('draws standard normals and is reproducible from a seed', () => {
    const a = seededRng(1);
    const b = seededRng(1);
    const xs = Array.from({ length: 20_000 }, () => gaussian(a));
    expect(gaussian(b)).toBe(xs[0]);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(variance).toBeGreaterThan(0.96);
    expect(variance).toBeLessThan(1.04);
  });

  it('does nothing without elapsed time and relaxes the anchor toward the last human price', () => {
    const s: BotState = { marketId: 'm', x: 0, mu: 0, humanX: 2, steppedAt: new Date(NOW) };
    expect(advance(s, new Date(NOW), { ...params, anchorFollowPerHour: 1 }, seededRng(1))).toBe(s);
    const later = advance(s, new Date(NOW + HOUR), { ...params, anchorFollowPerHour: 1 }, seededRng(1));
    expect(later.mu).toBeCloseTo(2 - 2 * Math.exp(-1), 12);
    expect(later.steppedAt.getTime()).toBe(NOW + HOUR);
    expect(advance(s, new Date(NOW + HOUR), params, seededRng(1)).mu).toBe(0);
  });

  it('moves the anchor by an EMA step toward a human price and carries x along', () => {
    const s: BotState = { marketId: 'm', x: 0.3, mu: 0.1, humanX: 0.1, steppedAt: new Date(NOW) };
    const next = followHumanTrade(s, 0.7, 0.5);
    const shift = 0.5 * (logit(0.7) - 0.1);
    expect(next.mu).toBeCloseTo(0.1 + shift, 12);
    expect(next.x).toBeCloseTo(0.3 + shift, 12);
    expect(next.humanX).toBeCloseTo(logit(0.7), 12);
    expect(next.steppedAt).toBe(s.steppedAt);
  });
});

describe('planBotTrade', () => {
  const b = 100;
  const at = (p: number) => inventoryForPrice(p, b);
  const none = { yes: 0, no: 0 };

  it('stays inside the dead band', () => {
    expect(
      planBotTrade({ probYes: 0.5, target: 0.505, inventory: at(0.5), liquidityB: b, held: none, caps: CAPS }),
    ).toBeNull();
  });

  it('caps the price move of one trade', () => {
    const q = at(0.5);
    const req = planBotTrade({ probYes: 0.5, target: 0.9, inventory: q, liquidityB: b, held: none, caps: CAPS });
    expect(req).toMatchObject({ action: 'buy', side: 'yes' });
    if (req?.action !== 'buy') throw new Error('expected a buy');
    expect(req.amountPts).toBeLessThanOrEqual(CAPS.maxStakePts);
    expect(quote(q, 'yes', req.amountPts, b).priceAfter).toBeCloseTo(0.53, 4);
  });

  it('caps the stake', () => {
    const q = at(0.5);
    const req = planBotTrade({
      probYes: 0.5,
      target: 0.9,
      inventory: q,
      liquidityB: 10_000,
      held: none,
      caps: CAPS,
    });
    expect(req).toEqual({ action: 'buy', side: 'yes', amountPts: 25 });
  });

  it('buys NO to lower the price and sells held shares of the other side first', () => {
    const q = at(0.6);
    expect(
      planBotTrade({ probYes: 0.6, target: 0.5, inventory: q, liquidityB: b, held: none, caps: CAPS }),
    ).toMatchObject({ action: 'buy', side: 'no' });
    const sell = planBotTrade({
      probYes: 0.6,
      target: 0.5,
      inventory: q,
      liquidityB: b,
      held: { yes: 4, no: 0 },
      caps: CAPS,
    });
    expect(sell).toEqual({ action: 'sell', side: 'yes', shares: 4 });
    const partial = planBotTrade({
      probYes: 0.6,
      target: 0.5,
      inventory: q,
      liquidityB: b,
      held: { yes: 1_000, no: 0 },
      caps: CAPS,
    });
    if (partial?.action !== 'sell') throw new Error('expected a sell');
    const after = lmsrPriceYes({ yes: q.yes - partial.shares, no: q.no }, b);
    expect(after).toBeCloseTo(0.57, 9);
  });

  it('skips trades below the minimum stake and prices people took to the extremes', () => {
    expect(
      planBotTrade({ probYes: 0.5, target: 0.52, inventory: at(0.5), liquidityB: 5, held: none, caps: CAPS }),
    ).toBeNull();
    expect(
      planBotTrade({ probYes: 0.99, target: 0.5, inventory: at(0.99), liquidityB: b, held: none, caps: CAPS }),
    ).toBeNull();
  });
});

describe('anchor follows human trades only', () => {
  it('moves on a human trade and stays on a bot trade', async () => {
    const repo = new MemoryMarketRepository();
    const market = await addMarket(repo, 'Anchor market one');
    const start = initialState(market.id, market.probYes, new Date(NOW));
    await repo.transaction((tx) => tx.saveBotState(start));
    const state = () => repo.transaction((tx) => tx.botState(market.id));

    const bot = marketBot(1);
    await executeTrade(repo, {
      slug: market.slug,
      userId: bot.userId,
      walletAddress: bot.address,
      now: new Date(NOW),
      request: { action: 'buy', side: 'yes', amountPts: 10 },
      bot: true,
      anchorAlpha: 0.5,
    });
    expect(await state()).toEqual(start);

    const done = await executeTrade(repo, {
      slug: market.slug,
      ...ALICE,
      now: new Date(NOW),
      request: { action: 'buy', side: 'yes', amountPts: 50 },
      anchorAlpha: 0.5,
    });
    expect(done.trade.bot).toBe(false);
    expect(await state()).toEqual(followHumanTrade(start, done.market.probYes, 0.5));
    expect(done.market).toMatchObject({ traders: 1, tradeCount: 2, botTradeCount: 1 });
    expect(done.market.botVolumeMicro).toBe(10_000_000);
  });
});

describe('MarketBots', () => {
  it('trades only open markets outside the quiet window, labelled and capped', async () => {
    const repo = new MemoryMarketRepository();
    const clock = { now: NOW };
    const open = await addMarket(repo, 'Open market for bots', 48);
    const soon = await addMarket(repo, 'Closing soon market', 0.4, 0.5, 48);
    const resolved = await addMarket(repo, 'Resolved market for bots', 48);
    const expired = await addMarket(repo, 'Expired market for bots', -1);
    await resolveMarket(repo, {
      slug: resolved.slug,
      userId: CREATOR.userId,
      walletAddress: CREATOR.address,
      isAdmin: false,
      outcome: 'yes',
      note: null,
      now: new Date(NOW),
    });
    const { bots } = runner(repo, clock);
    const trades = await run(bots, clock, 30);

    expect(trades.length).toBeGreaterThan(0);
    expect(new Set(trades.map((t) => t.market.slug))).toEqual(new Set([open.slug]));
    for (const { trade } of trades) {
      expect(trade.bot).toBe(true);
      expect(trade.walletAddress).toMatch(/^MarketBot[1-4]1+$/);
      expect(Math.abs(trade.priceAfter - trade.priceBefore)).toBeLessThanOrEqual(CONFIG.maxStep + 1e-9);
      if (trade.action === 'buy') expect(trade.costMicro).toBeLessThanOrEqual(CONFIG.maxStakePts * 1_000_000);
    }
    for (const m of [soon, resolved, expired]) {
      expect(await repo.transaction((tx) => tx.botState(m.id))).toBeNull();
      expect(await repo.recentTrades(m.id, 10)).toEqual([]);
    }
    const after = await repo.marketBySlug(open.slug);
    expect(after).toMatchObject({ traders: 0, botTradeCount: trades.length, tradeCount: trades.length });
  });

  it('shrinks the quiet window to the last 10 % of a short market', async () => {
    const at = (lifetimeMs: number) => ({ createdAt: new Date(NOW), closesAt: new Date(NOW + lifetimeMs) });
    const quiet = 30 * 60_000;
    expect(
      quietWindowMs({ ...(await addMarket(new MemoryMarketRepository(), 'Long market')), ...at(48 * HOUR) }, quiet),
    ).toBe(quiet);
    const short = await addMarket(new MemoryMarketRepository(), 'Short market');
    expect(quietWindowMs({ ...short, ...at(15 * 60_000) }, quiet)).toBe(90_000);
    expect(quietWindowMs({ ...short, ...at(4 * HOUR) }, quiet)).toBe(24 * 60_000);
    expect(quietWindowMs({ ...short, ...at(5 * HOUR) }, quiet)).toBe(quiet);

    const repo = new MemoryMarketRepository();
    const flash = await addMarket(repo, 'Flash market for bots', 0.25);
    const clock = { now: NOW };
    const { bots } = runner(repo, clock);
    const trades = await run(bots, clock, 15, 60_000);
    const times = trades.map((t) => t.trade.createdAt.getTime());
    expect(trades.length).toBeGreaterThan(0);
    expect(Math.max(...times)).toBeGreaterThanOrEqual(flash.closesAt.getTime() - 5 * 60_000);
    expect(Math.max(...times)).toBeLessThan(flash.closesAt.getTime() - 90_000);
  });

  it('ticks on one instance only while it holds the lease', async () => {
    const repo = new MemoryMarketRepository();
    await addMarket(repo, 'Lease market for bots', 48);
    const clock = { now: NOW };
    const store = new MemoryEphemeralStore(() => clock.now);
    const make = (owner: string) =>
      new MarketBots({
        repo,
        store,
        config: CONFIG,
        now: () => new Date(clock.now),
        log: silent,
        rng: seededRng(3),
        owner,
      });
    const a = make('instance-a');
    const b = make('instance-b');
    expect((await a.tick()).leased).toBe(true);
    expect(await b.tick()).toEqual({ leased: false, stepped: 0, trades: [] });
    clock.now += 20_000;
    expect((await a.tick()).leased).toBe(true);
    expect((await b.tick()).leased).toBe(false);
    await a.stop();
    expect((await b.tick()).leased).toBe(true);
    expect((await a.tick()).leased).toBe(false);
    clock.now += 61_000;
    expect((await a.tick()).leased).toBe(true);
  });
});

describe('bots in the api', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('labels bot trades, keeps them out of traders and the leaderboard', async () => {
    const repo = new MemoryMarketRepository();
    const market = await addMarket(repo, 'Api market for bots', 48);
    const built = makeTestApp({ markets: repo, clock: { now: NOW } });
    app = built.app;
    const { token } = await signIn(app);
    const human = await app.inject({
      method: 'POST',
      url: `/v1/markets/${market.slug}/trades`,
      headers: { origin: APP_ORIGIN, cookie: `wl_session=${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ action: 'buy', side: 'yes', amountPts: 20 }),
    });
    expect(human.statusCode).toBe(200);
    expect(TradeResponse.parse(human.json()).trade).toMatchObject({ bot: false });
    expect(human.json<{ trade: Record<string, unknown> }>().trade).not.toHaveProperty('botName');

    const clock = { now: NOW };
    const { bots } = runner(repo, clock);
    const trades = await run(bots, clock, 20);
    expect(trades.length).toBeGreaterThan(0);

    const detail = MarketDetailResponse.parse((await app.inject({ url: `/v1/markets/${market.slug}` })).json());
    expect(detail.market.traders).toBe(1);
    expect(detail.market.botTradeCount).toBe(trades.length);
    expect(detail.market.tradeCount).toBe(trades.length + 1);
    expect(detail.market.botVolumePts).toBeGreaterThan(0);
    expect(detail.market.botVolumePts).toBeLessThan(detail.market.volumePts);
    const botTrade = detail.trades.find((t) => t.bot);
    expect(botTrade?.botName).toMatch(/^Market bot #[1-4]$/);
    expect(detail.trades.filter((t) => !t.bot)).toHaveLength(1);

    const board = LeaderboardResponse.parse((await app.inject({ url: '/v1/leaderboard' })).json());
    expect(board.rankedTraders).toBe(1);
    expect(board.entries.map((e) => e.address)).not.toContain(marketBot(1).address);
    expect(board.entries.every((e) => !e.address.startsWith('MarketBot'))).toBe(true);
  });
});
