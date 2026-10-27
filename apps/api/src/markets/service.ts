import {
  type CreateMarketRequest,
  type DurationPresetId,
  durationPresetOf,
  inventoryForPrice,
  lmsrPriceYes,
  MARKET_MAX_DURATION_MS,
  MARKET_MIN_DURATION_MS,
  type ProposedOutcome,
  parseTweetUrl,
  type TradeRequest,
  type TweetSnapshot,
} from '@windle/shared';
import type { z } from 'zod';
import { HttpError } from '../errors.ts';
import { uuidv7 } from '../lib/crypto.ts';
import { followHumanTrade } from './bots/model.ts';
import { applyTrade, fromMicro, resolverRole, settle } from './engine.ts';
import type {
  AccountRecord,
  MarketRecord,
  MarketRepository,
  MarketTx,
  PositionRecord,
  ResolverRole,
  TradeRecord,
} from './types.ts';

type CreateData = z.output<typeof CreateMarketRequest>;

export const slugOf = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function slugBase(statement: string): string {
  return slugOf(statement.split(/\s+/).slice(0, 7).join(' ')).slice(0, 48).replace(/-+$/g, '') || 'market';
}

/**
 * Checks the request against the wizard's rules before any lookup or write, and returns when the market closes: now
 * plus the preset's duration with `durationPreset`, otherwise the custom `deadline`.
 */
export function checkCreateRequest(
  body: CreateData,
  now: Date,
): { closesAt: Date; durationPreset: DurationPresetId | null } {
  if (body.tier !== 'community')
    throw new HttpError(422, 'market_tier_unsupported', 'Only community markets can be created for now');
  const parsed = parseTweetUrl(body.tweetUrl);
  if (!parsed.ok) throw new HttpError(422, 'invalid_tweet_url', parsed.message);
  if (parsed.statusId !== body.source.id)
    throw new HttpError(422, 'tweet_mismatch', 'tweetUrl and source are different posts (send source.url)');
  if (parsed.handle !== 'i' && parsed.handle.toLowerCase() !== body.source.author.handle.toLowerCase())
    throw new HttpError(422, 'tweet_mismatch', 'tweetUrl and source name different accounts');
  const preset = body.durationPreset ?? null;
  let deadline = Number.NaN;
  if (preset) deadline = now.getTime() + durationPresetOf(preset).ms;
  else if (body.deadline !== undefined) deadline = Date.parse(body.deadline);
  if (!Number.isFinite(deadline)) throw new HttpError(422, 'invalid_deadline', 'Pick a deadline or a duration preset');
  if (deadline < now.getTime() + MARKET_MIN_DURATION_MS)
    throw new HttpError(422, 'invalid_deadline', 'The deadline must be at least 15 minutes from now');
  if (deadline > now.getTime() + MARKET_MAX_DURATION_MS)
    throw new HttpError(422, 'invalid_deadline', 'The deadline must be within a year');
  return { closesAt: new Date(deadline), durationPreset: preset };
}

export function duplicateError(existing: MarketRecord): HttpError {
  return new HttpError(409, 'duplicate_tweet', 'A market already exists for this tweet', undefined, {
    existingSlug: existing.slug,
  });
}

export interface NewMarketInput {
  statement: string;
  criteria: string;
  deadline: string;
  durationPreset?: DurationPresetId | null | undefined;
  tier: MarketRecord['tier'];
  project: { name: string; ticker: string; mint?: string | undefined };
  initialProbYes: number;
  liquidityB: number;
  collateral?: MarketRecord['collateral'] | undefined;
  source: TweetSnapshot;
  imageId?: string | null | undefined;
}

/** Inserts the market under the first free slug (`base`, `base-2`, ...). */
export async function insertMarket(
  repo: MarketRepository,
  input: NewMarketInput,
  creator: { userId: string; address: string },
  now: Date,
  opts: { slug?: string; id?: string } = {},
): Promise<{ market: MarketRecord; inserted: boolean }> {
  const q = inventoryForPrice(input.initialProbYes, input.liquidityB);
  const prob = lmsrPriceYes(q, input.liquidityB);
  const base = opts.slug ?? slugBase(input.statement);
  const record = (slug: string): MarketRecord => ({
    id: opts.id ?? uuidv7(now.getTime()),
    slug,
    tier: input.tier,
    status: 'open',
    project: {
      slug: slugOf(input.project.name) || 'project',
      name: input.project.name,
      ticker: input.project.ticker,
      ...(input.project.mint ? { mint: input.project.mint } : {}),
    },
    statement: input.statement,
    criteria: input.criteria,
    closesAt: new Date(Date.parse(input.deadline)),
    createdAt: now,
    durationPreset: input.durationPreset ?? null,
    creatorId: creator.userId,
    creatorAddress: creator.address,
    sourceTweetId: input.source.id,
    source: input.source,
    collateral: input.collateral ?? null,
    liquidityB: input.liquidityB,
    qYes: q.yes,
    qNo: q.no,
    probYes: prob,
    openProbYes: prob,
    volumeMicro: 0,
    traders: 0,
    tradeCount: 0,
    buyCount: 0,
    botVolumeMicro: 0,
    botTradeCount: 0,
    outcome: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionMethod: null,
    resolutionNote: null,
    imageId: input.imageId ?? null,
  });
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const market = record(slug);
    const result = await repo.insertMarket(market);
    if (result === 'ok') return { market, inserted: true };
    if (result === 'duplicate_tweet') {
      const existing = await repo.marketBySourceTweet(input.source.id);
      if (existing) return { market: existing, inserted: false };
    }
    // A fixed slug (the seed) is never renamed: an existing market with it means "already there".
    if (opts.slug !== undefined) {
      const existing = await repo.marketBySlug(opts.slug);
      if (existing) return { market: existing, inserted: false };
    }
  }
  throw new HttpError(503, 'service_unavailable', 'Could not allocate a market slug, retry');
}

export async function createMarket(
  repo: MarketRepository,
  body: CreateData,
  source: TweetSnapshot,
  creator: { userId: string; address: string },
  now: Date,
): Promise<MarketRecord> {
  const { closesAt, durationPreset } = checkCreateRequest(body, now);
  const { market, inserted } = await insertMarket(
    repo,
    {
      statement: body.statement,
      criteria: body.criteria,
      deadline: closesAt.toISOString(),
      durationPreset,
      tier: body.tier,
      project: body.project,
      initialProbYes: body.initialProbYes,
      liquidityB: body.liquidityB,
      source,
      imageId: body.imageId ?? null,
    },
    creator,
    now,
  );
  if (!inserted) throw duplicateError(market);
  return market;
}

export interface TradeCommand {
  slug: string;
  userId: string;
  walletAddress: string;
  request: TradeRequest;
  now: Date;
  /** Placed by a house market bot (markets/bots). */
  bot?: boolean;
  /** EMA weight with which a human trade pulls the bots' anchor (BOTS_ANCHOR_ALPHA); omitted: anchor untouched. */
  anchorAlpha?: number;
}

export interface TradeDone {
  market: MarketRecord;
  account: AccountRecord;
  position: PositionRecord;
  trade: TradeRecord;
}

/**
 * The trade path shared by people and house bots, inside a transaction that already holds `market`'s row lock: the
 * trader's account row is locked next (always market, then account).
 */
export async function tradeLocked(tx: MarketTx, market: MarketRecord, cmd: TradeCommand): Promise<TradeDone> {
  const account = await tx.lockAccount(cmd.userId, cmd.now);
  const position = await tx.position(cmd.userId, market.id);
  const out = applyTrade({
    market,
    account,
    position,
    userId: cmd.userId,
    walletAddress: cmd.walletAddress,
    now: cmd.now,
    request: cmd.request,
    bot: cmd.bot ?? false,
  });
  await tx.saveMarket(out.market, cmd.now);
  await tx.saveAccount(out.account, cmd.now);
  await tx.savePosition(out.position);
  const trade = await tx.insertTrade(out.trade);
  if (!cmd.bot && cmd.anchorAlpha !== undefined) {
    const state = await tx.botState(market.id);
    if (state) await tx.saveBotState(followHumanTrade(state, out.market.probYes, cmd.anchorAlpha));
  }
  return { market: out.market, account: out.account, position: out.position, trade };
}

/** One trade = one transaction: market row locked, then the trader's account row (always in that order). */
export function executeTrade(repo: MarketRepository, cmd: TradeCommand): Promise<TradeDone> {
  return repo.transaction(async (tx) => {
    const market = await tx.lockMarket(cmd.slug);
    if (!market) throw new HttpError(404, 'market_not_found', 'No market with this slug');
    return tradeLocked(tx, market, cmd);
  });
}

export interface ResolveCommand {
  slug: string;
  userId: string;
  walletAddress: string;
  isAdmin: boolean;
  outcome: ProposedOutcome;
  note: string | null;
  now: Date;
}

export interface ResolveDone {
  market: MarketRecord;
  alreadyResolved: boolean;
  settlement: {
    outcome: ProposedOutcome;
    method: ResolverRole;
    positions: number;
    payoutPts: number;
    resolvedAt: Date;
  };
}

/**
 * Resolves and settles in one transaction: the market row is locked, every unsettled position is paid, the holders'
 * accounts are locked in user id order and credited. Repeating the same outcome is a no-op that reports the first
 * settlement; a different outcome on a settled market is 409.
 */
export function resolveMarket(repo: MarketRepository, cmd: ResolveCommand): Promise<ResolveDone> {
  return repo.transaction(async (tx) => {
    const market = await tx.lockMarket(cmd.slug);
    if (!market) throw new HttpError(404, 'market_not_found', 'No market with this slug');
    if (market.status !== 'open') {
      const isCreator = market.creatorId === cmd.userId;
      if (!cmd.isAdmin && !isCreator)
        throw new HttpError(403, 'forbidden', 'Only the creator of this market or an admin can resolve it');
      if (market.outcome !== cmd.outcome || market.resolvedAt === null || market.resolutionMethod === null)
        throw new HttpError(409, 'market_already_resolved', `This market was already resolved: ${market.outcome}`);
      const prior = await tx.resolution(market.id);
      return {
        market,
        alreadyResolved: true,
        settlement: {
          outcome: market.outcome,
          method: market.resolutionMethod,
          positions: prior?.positions ?? 0,
          payoutPts: fromMicro(prior?.payoutMicro ?? 0),
          resolvedAt: market.resolvedAt,
        },
      };
    }
    const role = resolverRole({
      market,
      userId: cmd.userId,
      isAdmin: cmd.isAdmin,
      outcome: cmd.outcome,
      now: cmd.now,
    });
    const open = await tx.unsettledPositions(market.id);
    const accounts = await tx.lockAccounts([...new Set(open.map((p) => p.userId))]);
    const done = settle(market, open, accounts, {
      outcome: cmd.outcome,
      role,
      userId: cmd.userId,
      note: cmd.note,
      now: cmd.now,
    });
    for (const p of done.positions) await tx.savePosition(p);
    for (const a of done.accounts) await tx.saveAccount(a, cmd.now);
    await tx.saveMarket(done.market, cmd.now);
    await tx.insertResolution({
      marketId: market.id,
      outcome: cmd.outcome,
      method: role,
      resolvedBy: cmd.userId,
      walletAddress: cmd.walletAddress,
      note: cmd.note,
      positions: done.positions.length,
      payoutMicro: done.payoutMicro,
      createdAt: cmd.now,
    });
    return {
      market: done.market,
      alreadyResolved: false,
      settlement: {
        outcome: cmd.outcome,
        method: role,
        positions: done.positions.length,
        payoutPts: fromMicro(done.payoutMicro),
        resolvedAt: cmd.now,
      },
    };
  });
}
