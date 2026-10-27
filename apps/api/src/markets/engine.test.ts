import {
  inventoryForPrice,
  lmsrCost,
  lmsrPriceYes,
  proceedsForShares,
  quote,
  STARTING_BALANCE_PTS,
  type TweetSnapshot,
} from '@windle/shared';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../errors.ts';
import { applyTrade, fromMicro, MICRO, payoutMicro, STARTING_BALANCE_MICRO, settle, toMicro } from './engine.ts';
import { MemoryMarketRepository } from './memory.ts';
import { executeTrade, insertMarket, resolveMarket, slugBase } from './service.ts';
import type { AccountRecord, MarketRecord } from './types.ts';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const HOUR = 3_600_000;
const CREATOR = { userId: 'creator-0000', address: 'Creator1111111111111111111111111111111111111' };
const ALICE = { userId: 'alice-000000', walletAddress: 'A1ice111111111111111111111111111111111111111' };
const BOB = { userId: 'bob-00000000', walletAddress: 'Bob11111111111111111111111111111111111111111' };

const source: TweetSnapshot = {
  id: '1846811200000000099',
  url: 'https://x.com/sproutfi_dev/status/1846811200000000099',
  author: { handle: 'sproutfi_dev', name: 'Sprout' },
  text: 'staking v2 ships friday',
  createdAt: '2026-10-16T10:00:00.000Z',
  capturedAt: '2026-10-16T11:00:00.000Z',
};

async function setup(opts: { prob?: number; b?: number; closesInHours?: number } = {}) {
  const repo = new MemoryMarketRepository();
  const { market } = await insertMarket(
    repo,
    {
      statement: 'Sprout deploys staking v2 to Solana mainnet by Friday.',
      criteria: 'YES if staking v2 is live on mainnet before the deadline.',
      deadline: new Date(NOW.getTime() + (opts.closesInHours ?? 48) * HOUR).toISOString(),
      tier: 'community',
      project: { name: 'Sproutfi', ticker: 'SPRT' },
      initialProbYes: opts.prob ?? 0.5,
      liquidityB: opts.b ?? 50,
      source,
    },
    CREATOR,
    NOW,
  );
  return { repo, market };
}

const buy = (repo: MemoryMarketRepository, slug: string, who: typeof ALICE, side: 'yes' | 'no', amountPts: number) =>
  executeTrade(repo, { slug, ...who, now: NOW, request: { action: 'buy', side, amountPts } });

const sell = (repo: MemoryMarketRepository, slug: string, who: typeof ALICE, side: 'yes' | 'no', shares: number) =>
  executeTrade(repo, { slug, ...who, now: NOW, request: { action: 'sell', side, shares } });

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof HttpError) return err.code;
    throw err;
  }
  return 'ok';
}

describe('micro-points', () => {
  it('rounds down to 6 decimals without binary noise', () => {
    expect(toMicro(1.005)).toBe(1_005_000);
    expect(toMicro(10.1)).toBe(10_100_000);
    expect(toMicro(0.0000019)).toBe(1);
    expect(fromMicro(STARTING_BALANCE_MICRO)).toBe(STARTING_BALANCE_PTS);
  });
});

describe('trading (LMSR from @windle/shared)', () => {
  it('opens at the requested odds and prices a buy exactly like the shared quote', async () => {
    const { repo, market } = await setup({ prob: 0.64, b: 50 });
    const q0 = inventoryForPrice(0.64, 50);
    expect(market.qYes).toBe(q0.yes);
    expect(market.qNo).toBe(q0.no);
    expect(market.probYes).toBeCloseTo(0.64, 12);

    const expected = quote(q0, 'yes', 25, 50);
    const done = await buy(repo, market.slug, ALICE, 'yes', 25);
    expect(done.trade.shares).toBe(expected.shares);
    expect(done.trade.priceBefore).toBe(market.probYes);
    expect(done.trade.priceAfter).toBe(expected.priceAfter);
    expect(done.market.qYes).toBe(q0.yes + expected.shares);
    expect(done.market.probYes).toBe(lmsrPriceYes({ yes: done.market.qYes, no: done.market.qNo }, 50));
    // The pool took exactly what the cost function says (within float noise).
    expect(lmsrCost({ yes: done.market.qYes, no: done.market.qNo }, 50) - lmsrCost(q0, 50)).toBeCloseTo(25, 9);
    expect(done.account.balanceMicro).toBe(STARTING_BALANCE_MICRO - 25 * MICRO);
    expect(done.position).toMatchObject({ yesShares: expected.shares, yesCostMicro: 25 * MICRO, noShares: 0 });
    expect(done.market).toMatchObject({ volumeMicro: 25 * MICRO, tradeCount: 1, traders: 1 });
  });

  it('sells at C(q) - C(q - shares), floors proceeds to a micro-point and moves cost basis pro rata', async () => {
    const { repo, market } = await setup();
    const bought = await buy(repo, market.slug, ALICE, 'no', 40);
    const half = bought.trade.shares / 2;
    const q = { yes: bought.market.qYes, no: bought.market.qNo };
    const expected = toMicro(proceedsForShares(q, 'no', half, 50));
    const sold = await sell(repo, market.slug, ALICE, 'no', half);
    expect(sold.trade.costMicro).toBe(expected);
    expect(sold.account.balanceMicro).toBe(STARTING_BALANCE_MICRO - 40 * MICRO + expected);
    expect(sold.position.noCostMicro).toBe(20 * MICRO);
    expect(sold.position.realizedMicro).toBe(expected - 20 * MICRO);
    expect(sold.market.traders).toBe(1);
  });

  it('sells the whole holding when the requested shares are within float noise of it', async () => {
    const { repo, market } = await setup();
    const bought = await buy(repo, market.slug, ALICE, 'yes', 10);
    const sold = await sell(repo, market.slug, ALICE, 'yes', bought.trade.shares * (1 + 1e-12));
    expect(sold.position).toMatchObject({ yesShares: 0, yesCostMicro: 0 });
    // Round trip at the same price loses nothing but the micro-point floor.
    expect(STARTING_BALANCE_MICRO - sold.account.balanceMicro).toBeLessThanOrEqual(1);
  });

  it('enforces balance, holdings, minimum amount and slippage guards, and rolls back on failure', async () => {
    const { repo, market } = await setup();
    expect(await codeOf(buy(repo, market.slug, ALICE, 'yes', STARTING_BALANCE_PTS + 1))).toBe('insufficient_balance');
    expect(await codeOf(buy(repo, market.slug, ALICE, 'yes', 0.5))).toBe('invalid_amount');
    expect(await codeOf(sell(repo, market.slug, ALICE, 'yes', 1))).toBe('insufficient_shares');
    const q = quote({ yes: market.qYes, no: market.qNo }, 'yes', 10, 50);
    const guarded = executeTrade(repo, {
      slug: market.slug,
      ...ALICE,
      now: NOW,
      request: { action: 'buy', side: 'yes', amountPts: 10, minShares: q.shares + 1e-6 },
    });
    expect(await codeOf(guarded)).toBe('slippage_exceeded');
    // Nothing was written by the failed attempts.
    expect(await repo.account(ALICE.userId)).toBeNull();
    expect((await repo.marketBySlug(market.slug))?.tradeCount).toBe(0);

    const ok = await executeTrade(repo, {
      slug: market.slug,
      ...ALICE,
      now: NOW,
      request: { action: 'buy', side: 'yes', amountPts: 10, minShares: q.shares },
    });
    const minProceeds = proceedsForShares({ yes: ok.market.qYes, no: ok.market.qNo }, 'yes', ok.trade.shares, 50);
    const sellGuard = executeTrade(repo, {
      slug: market.slug,
      ...ALICE,
      now: NOW,
      request: { action: 'sell', side: 'yes', shares: ok.trade.shares, minProceedsPts: minProceeds + 0.01 },
    });
    expect(await codeOf(sellGuard)).toBe('slippage_exceeded');
  });

  it('spends the whole balance down to exactly zero', async () => {
    const { repo, market } = await setup({ b: 500 });
    const done = await buy(repo, market.slug, ALICE, 'yes', STARTING_BALANCE_PTS);
    expect(done.account.balanceMicro).toBe(0);
    expect(await codeOf(buy(repo, market.slug, ALICE, 'yes', 1))).toBe('insufficient_balance');
  });

  it('rejects the creator, closed and unknown markets', async () => {
    const { repo, market } = await setup({ closesInHours: 2 });
    expect(
      await codeOf(
        executeTrade(repo, {
          slug: market.slug,
          userId: CREATOR.userId,
          walletAddress: CREATOR.address,
          now: NOW,
          request: { action: 'buy', side: 'yes', amountPts: 5 },
        }),
      ),
    ).toBe('creator_cannot_trade');
    const late = new Date(NOW.getTime() + 2 * HOUR);
    expect(
      await codeOf(
        executeTrade(repo, {
          slug: market.slug,
          ...ALICE,
          now: late,
          request: { action: 'buy', side: 'yes', amountPts: 5 },
        }),
      ),
    ).toBe('market_closed');
    expect(await codeOf(buy(repo, 'no-such-market', ALICE, 'yes', 5))).toBe('market_not_found');
  });

  it('serialises concurrent trades on one market (each sees the previous inventory)', async () => {
    const { repo, market } = await setup();
    const results = await Promise.all([
      buy(repo, market.slug, ALICE, 'yes', 10),
      buy(repo, market.slug, BOB, 'yes', 10),
      buy(repo, market.slug, ALICE, 'no', 10),
    ]);
    const final = await repo.marketBySlug(market.slug);
    const totalYes = (results[0]?.trade.shares ?? 0) + (results[1]?.trade.shares ?? 0);
    expect(final?.qYes).toBeCloseTo(market.qYes + totalYes, 9);
    expect(final?.tradeCount).toBe(3);
    expect(final?.traders).toBe(2);
    expect(results[1]?.trade.priceBefore).toBe(results[0]?.trade.priceAfter);
  });
});

describe('resolution and settlement', () => {
  async function traded() {
    const { repo, market } = await setup({ closesInHours: 2 });
    const a = await buy(repo, market.slug, ALICE, 'yes', 100);
    const b = await buy(repo, market.slug, BOB, 'no', 60);
    return { repo, market, aliceShares: a.trade.shares, bobShares: b.trade.shares };
  }

  const resolve = (
    repo: MemoryMarketRepository,
    slug: string,
    outcome: 'yes' | 'no' | 'void',
    opts: { userId?: string; isAdmin?: boolean; now?: Date } = {},
  ) =>
    resolveMarket(repo, {
      slug,
      userId: opts.userId ?? CREATOR.userId,
      walletAddress: CREATOR.address,
      isAdmin: opts.isAdmin ?? false,
      outcome,
      note: null,
      now: opts.now ?? NOW,
    });

  it('YES pays 1 pt per winning share and nothing to NO holders, in the same transaction', async () => {
    const { repo, market, aliceShares } = await traded();
    const done = await resolve(repo, market.slug, 'yes');
    expect(done.market).toMatchObject({ status: 'resolved', outcome: 'yes', resolutionMethod: 'creator' });
    expect(done.settlement).toMatchObject({ positions: 2, payoutPts: fromMicro(toMicro(aliceShares)) });
    expect((await repo.account(ALICE.userId))?.balanceMicro).toBe(
      STARTING_BALANCE_MICRO - 100 * MICRO + toMicro(aliceShares),
    );
    expect((await repo.account(BOB.userId))?.balanceMicro).toBe(STARTING_BALANCE_MICRO - 60 * MICRO);
    const alice = await repo.position(ALICE.userId, market.id);
    expect(alice).toMatchObject({ payoutMicro: toMicro(aliceShares), yesCostMicro: 0 });
    expect(alice?.settledAt).toEqual(NOW);
    expect(alice?.realizedMicro).toBe(toMicro(aliceShares) - 100 * MICRO);
    expect(repo.resolutions.get(market.id)).toMatchObject({ outcome: 'yes', positions: 2 });
  });

  it('NO pays the NO side; the creator may only decide NO after the deadline', async () => {
    const { repo, market, bobShares } = await traded();
    expect(await codeOf(resolve(repo, market.slug, 'no'))).toBe('resolve_too_early');
    const after = new Date(NOW.getTime() + 3 * HOUR);
    await resolve(repo, market.slug, 'no', { now: after });
    expect((await repo.account(BOB.userId))?.balanceMicro).toBe(
      STARTING_BALANCE_MICRO - 60 * MICRO + toMicro(bobShares),
    );
    expect((await repo.account(ALICE.userId))?.balanceMicro).toBe(STARTING_BALANCE_MICRO - 100 * MICRO);
  });

  it('VOID refunds every remaining cost basis', async () => {
    const { repo, market } = await traded();
    const done = await resolve(repo, market.slug, 'void', { userId: 'admin-000000', isAdmin: true });
    expect(done.market).toMatchObject({ status: 'voided', resolutionMethod: 'admin' });
    expect(done.settlement.payoutPts).toBe(160);
    expect((await repo.account(ALICE.userId))?.balanceMicro).toBe(STARTING_BALANCE_MICRO);
    expect((await repo.account(BOB.userId))?.balanceMicro).toBe(STARTING_BALANCE_MICRO);
  });

  it('is idempotent for the same outcome, refuses a second different outcome, and stops trading', async () => {
    const { repo, market } = await traded();
    await resolve(repo, market.slug, 'yes');
    const again = await resolve(repo, market.slug, 'yes');
    expect(again.alreadyResolved).toBe(true);
    expect(again.settlement.positions).toBe(2);
    const balance = (await repo.account(ALICE.userId))?.balanceMicro;
    expect(await codeOf(resolve(repo, market.slug, 'no', { isAdmin: true }))).toBe('market_already_resolved');
    expect((await repo.account(ALICE.userId))?.balanceMicro).toBe(balance);
    expect(await codeOf(buy(repo, market.slug, ALICE, 'yes', 5))).toBe('market_closed');
  });

  it('lets only the creator or an admin resolve', async () => {
    const { repo, market } = await traded();
    expect(await codeOf(resolve(repo, market.slug, 'yes', { userId: ALICE.userId }))).toBe('forbidden');
    expect(await codeOf(resolve(repo, market.slug, 'no', { userId: ALICE.userId, isAdmin: true }))).toBe('ok');
  });

  it('settle() pays positions and credits accounts once per holder', () => {
    const market = { id: 'm', probYes: 0.5 } as MarketRecord;
    const accounts = new Map<string, AccountRecord>([['u', { userId: 'u', balanceMicro: 0, createdAt: NOW }]]);
    const position = {
      userId: 'u',
      marketId: 'm',
      yesShares: 2.5,
      noShares: 1,
      yesCostMicro: 1_000_000,
      noCostMicro: 500_000,
      realizedMicro: 0,
      payoutMicro: null,
      settledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(payoutMicro(position, 'yes')).toBe(2_500_000);
    expect(payoutMicro(position, 'no')).toBe(1_000_000);
    expect(payoutMicro(position, 'void')).toBe(1_500_000);
    const out = settle(market, [position], accounts, {
      outcome: 'yes',
      role: 'admin',
      userId: 'x',
      note: null,
      now: NOW,
    });
    expect(out.accounts).toEqual([{ userId: 'u', balanceMicro: 2_500_000, createdAt: NOW }]);
    expect(out.positions[0]).toMatchObject({ realizedMicro: 1_000_000, payoutMicro: 2_500_000 });
  });
});

describe('applyTrade', () => {
  it('counts a trader once per market', async () => {
    const { market } = await setup();
    const account = { userId: ALICE.userId, balanceMicro: STARTING_BALANCE_MICRO, createdAt: NOW };
    const first = applyTrade({
      market,
      account,
      position: null,
      ...ALICE,
      now: NOW,
      request: { action: 'buy', side: 'yes', amountPts: 5 },
    });
    const second = applyTrade({
      market: first.market,
      account: first.account,
      position: first.position,
      ...ALICE,
      now: NOW,
      request: { action: 'buy', side: 'no', amountPts: 5 },
    });
    expect(second.market.traders).toBe(1);
  });
});

describe('slugs', () => {
  it('takes the first words of the statement and dedupes with a suffix', async () => {
    expect(slugBase('Sprout deploys staking v2 to Solana mainnet by Friday.')).toBe(
      'sprout-deploys-staking-v2-to-solana-mainnet',
    );
    expect(slugBase('???')).toBe('market');
    const { repo } = await setup();
    const { market } = await insertMarket(
      repo,
      {
        statement: 'Sprout deploys staking v2 to Solana mainnet by Friday.',
        criteria: 'YES if staking v2 is live on mainnet before the deadline.',
        deadline: new Date(NOW.getTime() + 48 * HOUR).toISOString(),
        tier: 'community',
        project: { name: 'Sproutfi', ticker: 'SPRT' },
        initialProbYes: 0.5,
        liquidityB: 50,
        source: { ...source, id: '1846811200000000100' },
      },
      CREATOR,
      NOW,
    );
    expect(market.slug).toBe('sprout-deploys-staking-v2-to-solana-mainnet-2');
  });
});
