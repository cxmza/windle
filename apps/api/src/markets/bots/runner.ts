import { randomUUID } from 'node:crypto';
import type { BotsConfig } from '../../config.ts';
import { HttpError } from '../../errors.ts';
import type { EphemeralStore } from '../../store/types.ts';
import { inventoryOf, isTradable, MICRO } from '../engine.ts';
import { type TradeDone, tradeLocked } from '../service.ts';
import type { MarketRecord, MarketRepository } from '../types.ts';
import { type MarketBot, marketBots } from './identity.ts';
import { advance, initialState, planBotTrade, type Rng, sigmoid } from './model.ts';

export const BOTS_LEASE_KEY = 'market-bots';
/** Bots are unranked, so their practice balance is only a float; it is refilled before it could stop a trade. */
export const BOT_BALANCE_MICRO = 1_000_000 * MICRO;
const BOT_TOP_UP_BELOW_MICRO = 100_000 * MICRO;
/** Newest open markets a tick draws its random subset from. */
const CANDIDATES = 100;
const QUIET_SHARE_OF_LIFETIME = 0.1;

export interface BotsLogger {
  debug(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface MarketBotsDeps {
  repo: MarketRepository;
  store: EphemeralStore;
  config: BotsConfig;
  now: () => Date;
  log: BotsLogger;
  rng?: Rng;
  /** Lease owner id of this process. */
  owner?: string;
}

export interface TickResult {
  /** False: another instance holds the lease and this one did nothing. */
  leased: boolean;
  /** Markets whose bot state was advanced. */
  stepped: number;
  trades: TradeDone[];
}

/**
 * How long before its close a market is left alone: `quietBeforeCloseMs`, but never more than the last 10 % of the
 * market's whole run, so a 15-minute market still trades until its final 90 seconds.
 */
export function quietWindowMs(m: MarketRecord, quietBeforeCloseMs: number): number {
  const lifetime = Math.max(0, m.closesAt.getTime() - m.createdAt.getTime());
  return Math.min(quietBeforeCloseMs, lifetime * QUIET_SHARE_OF_LIFETIME);
}

function sample<T>(items: readonly T[], k: number, rng: Rng): T[] {
  const pool = [...items];
  const n = Math.min(k, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const picked = pool[j] as T;
    pool[j] = pool[i] as T;
    pool[i] = picked;
  }
  return pool.slice(0, n);
}

/**
 * Runs the house market bots inside the api process. Every tick (jittered) the instance holding the Redis lease
 * advances the price model of a few open markets and lets one bot trade each toward its target, through the same
 * locked transaction as a person's trade. Other instances only keep trying for the lease.
 */
export class MarketBots {
  private readonly deps: MarketBotsDeps;
  private readonly rng: Rng;
  private readonly owner: string;
  private readonly bots: MarketBot[];
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;
  private stopped = true;
  private botsReady = false;

  constructor(deps: MarketBotsDeps) {
    this.deps = deps;
    this.rng = deps.rng ?? Math.random;
    this.owner = deps.owner ?? randomUUID();
    this.bots = marketBots(deps.config.count);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.deps.log.info({ bots: this.bots.length, tickMs: this.deps.config.tickMs }, 'market bots started');
    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running;
    await this.deps.store.releaseLease(BOTS_LEASE_KEY, this.owner).catch(() => {});
  }

  private schedule(): void {
    if (this.stopped) return;
    const delay = this.deps.config.tickMs * (0.75 + 0.5 * this.rng());
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .catch((err: unknown) => this.deps.log.warn({ err: { message: String(err) } }, 'market bots tick failed'))
        .finally(() => {
          this.running = null;
          this.schedule();
        });
    }, delay);
    this.timer.unref();
  }

  private eligible(m: MarketRecord, now: Date): boolean {
    return (
      isTradable(m, now) && m.closesAt.getTime() - now.getTime() > quietWindowMs(m, this.deps.config.quietBeforeCloseMs)
    );
  }

  async tick(): Promise<TickResult> {
    const { repo, store, config, log } = this.deps;
    const now = this.deps.now();
    const ttl = Math.max(3 * config.tickMs, 30_000);
    if (!(await store.acquireLease(BOTS_LEASE_KEY, this.owner, ttl))) return { leased: false, stepped: 0, trades: [] };
    if (!this.botsReady) {
      for (const bot of this.bots) await repo.ensureBotUser(bot.userId, now);
      this.botsReady = true;
    }
    const { markets } = await repo.listMarkets({
      status: 'open',
      tier: undefined,
      sort: 'new',
      limit: CANDIDATES,
      offset: 0,
      now,
    });
    const picked = sample(
      markets.filter((m) => this.eligible(m, now)),
      config.marketsPerTick,
      this.rng,
    );
    const result: TickResult = { leased: true, stepped: 0, trades: [] };
    for (const m of picked) {
      try {
        const step = await this.step(m.slug, now);
        if (step.stepped) result.stepped += 1;
        if (step.trade) {
          result.trades.push(step.trade);
          const t = step.trade.trade;
          log.debug(
            { market: m.slug, bot: t.walletAddress, action: t.action, side: t.side, p: t.priceAfter },
            'market bot trade',
          );
        }
      } catch (err) {
        const detail = err instanceof HttpError ? { code: err.code } : { message: String(err) };
        log.warn({ market: m.slug, err: detail }, 'market bot step failed');
      }
    }
    return result;
  }

  /** One market, one transaction: lock it, advance its model, maybe trade. A failed trade rolls the step back. */
  private step(slug: string, now: Date): Promise<{ stepped: boolean; trade: TradeDone | null }> {
    const { config } = this.deps;
    return this.deps.repo.transaction(async (tx) => {
      const market = await tx.lockMarket(slug);
      if (!market || !this.eligible(market, now)) return { stepped: false, trade: null };
      const prev = (await tx.botState(market.id)) ?? initialState(market.id, market.probYes, now);
      const state = advance(prev, now, config, this.rng);
      await tx.saveBotState(state);
      const bot = this.bots[Math.min(this.bots.length - 1, Math.floor(this.rng() * this.bots.length))];
      if (!bot) return { stepped: true, trade: null };
      const position = await tx.position(bot.userId, market.id);
      const open = position !== null && position.settledAt === null;
      const request = planBotTrade({
        probYes: market.probYes,
        target: sigmoid(state.x),
        inventory: inventoryOf(market),
        liquidityB: market.liquidityB,
        held: { yes: open ? position.yesShares : 0, no: open ? position.noShares : 0 },
        caps: config,
      });
      if (!request) return { stepped: true, trade: null };
      const account = await tx.lockAccount(bot.userId, now);
      if (account.balanceMicro < BOT_TOP_UP_BELOW_MICRO)
        await tx.saveAccount({ ...account, balanceMicro: BOT_BALANCE_MICRO }, now);
      const trade = await tradeLocked(tx, market, {
        slug,
        userId: bot.userId,
        walletAddress: bot.address,
        request,
        now,
        bot: true,
      });
      return { stepped: true, trade };
    });
  }
}
