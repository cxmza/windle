import type { ApiImage, ApiMarket, ApiPosition, ApiTrade, MarketStats, MarketStatus, Resolution } from '@windle/shared';
import { botNameOf } from './bots/identity.ts';
import { fromMicro, isTradable, markValuePts } from './engine.ts';
import type { MarketRecord, PositionRecord, TradeRecord } from './types.ts';

export interface Viewer {
  userId: string;
  isAdmin: boolean;
}

export const shareUrl = (appOrigin: string, slug: string) => `${appOrigin}/s/${slug}`;

export function publicStatus(m: MarketRecord, now: Date): MarketStatus {
  if (m.status !== 'open') return m.status;
  return now.getTime() < m.closesAt.getTime() ? 'open' : 'closed';
}

function resolutionOf(m: MarketRecord): Resolution | undefined {
  if (m.outcome === null || m.resolvedAt === null || m.resolutionMethod === null) return undefined;
  const at = m.resolvedAt.toISOString();
  return {
    method: m.resolutionMethod,
    proposedOutcome: m.outcome,
    evidence: m.resolutionNote ? [{ kind: 'note', text: m.resolutionNote }] : [],
    proposedAt: at,
    disputeEndsAt: at,
    disputes: [],
    finalOutcome: m.outcome,
    resolvedAt: at,
  };
}

export function toApiMarket(
  m: MarketRecord,
  now: Date,
  appOrigin: string,
  viewer?: Viewer | null,
  stats?: MarketStats,
  image: ApiImage | null = null,
): ApiMarket {
  const tradable = isTradable(m, now);
  const resolution = resolutionOf(m);
  const isCreator = viewer ? viewer.userId === m.creatorId : false;
  return {
    id: m.id,
    slug: m.slug,
    tier: m.tier,
    status: publicStatus(m, now),
    project: m.project,
    statement: m.statement,
    criteria: m.criteria,
    deadline: m.closesAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
    creator: m.creatorAddress,
    ...(m.source ? { source: m.source } : {}),
    liquidityB: m.liquidityB,
    qYes: m.qYes,
    qNo: m.qNo,
    probYes: m.probYes,
    volumePts: fromMicro(m.volumeMicro),
    traders: m.traders,
    botVolumePts: fromMicro(m.botVolumeMicro),
    botTradeCount: m.botTradeCount,
    ...(m.collateral ? { collateral: m.collateral } : {}),
    ...(resolution ? { resolution } : {}),
    tradable,
    tradeCount: m.tradeCount,
    shareUrl: shareUrl(appOrigin, m.slug),
    durationPreset: m.durationPreset,
    ...(stats ? { stats } : {}),
    image,
    ...(viewer
      ? {
          viewer: {
            isCreator,
            canTrade: tradable && !isCreator,
            canResolve: m.status === 'open' && (isCreator || viewer.isAdmin),
          },
        }
      : {}),
  };
}

export function toApiTrade(t: TradeRecord, avatar: ApiImage | null = null): ApiTrade {
  return {
    id: t.id,
    marketId: t.marketId,
    marketSlug: t.marketSlug,
    action: t.action,
    side: t.side,
    shares: t.shares,
    costPts: fromMicro(t.costMicro),
    priceBefore: t.priceBefore,
    priceAfter: t.priceAfter,
    by: t.walletAddress,
    at: t.createdAt.toISOString(),
    bot: t.bot,
    ...(t.bot ? { botName: botNameOf(t.userId) } : {}),
    avatar,
  };
}

export function toApiPosition(p: PositionRecord, m: MarketRecord): ApiPosition {
  const yesCostPts = fromMicro(p.yesCostMicro);
  const noCostPts = fromMicro(p.noCostMicro);
  return {
    marketId: p.marketId,
    marketSlug: m.slug,
    yesShares: p.yesShares,
    noShares: p.noShares,
    yesCostPts,
    noCostPts,
    costBasisPts: fromMicro(p.yesCostMicro + p.noCostMicro),
    realizedPts: fromMicro(p.realizedMicro),
    claimed: p.settledAt !== null,
    valuePts: markValuePts(p, m),
    payoutPts: p.payoutMicro === null ? null : fromMicro(p.payoutMicro),
    settledAt: p.settledAt === null ? null : p.settledAt.toISOString(),
  };
}
