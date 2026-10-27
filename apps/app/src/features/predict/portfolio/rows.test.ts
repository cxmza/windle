import type { ApiMarket, ApiPortfolio, ApiPosition } from '@windle/shared';
import { describe, expect, it } from 'vitest';
import { buildPortfolio } from '../selectors';
import { ISO, makeMarket, makeSettled } from '../test-support';
import { positionRows } from './rows';

const open = makeMarket({ slug: 'open-one', prob: 0.6 });
const won = makeSettled('yes', { slug: 'won-one' });
const lost = makeSettled('no', { slug: 'lost-one' });
const refunded = makeSettled('void', { slug: 'void-one' });
const settledAt = ISO(Date.now() - 3_600_000);

const position = (m: ApiMarket, over: Partial<ApiPosition>): ApiPosition => {
  const base: ApiPosition = {
    marketId: m.id,
    marketSlug: m.slug,
    yesShares: 0,
    noShares: 0,
    yesCostPts: 0,
    noCostPts: 0,
    costBasisPts: 0,
    realizedPts: 0,
    claimed: false,
    valuePts: 0,
    payoutPts: null,
    settledAt: null,
    ...over,
  };
  const held = base.yesShares * m.probYes + base.noShares * (1 - m.probYes);
  return { ...base, valuePts: base.settledAt ? 0 : held };
};

function portfolioOf(positions: ApiPosition[], markets: ApiMarket[]): ApiPortfolio {
  const openValue = positions.reduce((a, p) => a + p.valuePts, 0);
  return {
    balancePts: 800,
    startingBalancePts: 1000,
    openValuePts: openValue,
    netWorthPts: 800 + openValue,
    pnlPts: 800 + openValue - 1000,
    rank: positions.length > 0 ? 3 : null,
    positions,
    markets,
    history: [],
  };
}

describe('buildPortfolio', () => {
  it('carries the server totals and sums realized and unrealized from the positions', () => {
    const view = buildPortfolio(
      portfolioOf(
        [
          position(open, { yesShares: 100, yesCostPts: 60, costBasisPts: 60 }),
          position(won, { yesShares: 50, realizedPts: 20, claimed: true, payoutPts: 50, settledAt }),
        ],
        [open, won],
      ),
    );
    expect(view.balancePts).toBe(800);
    expect(view.equityPts).toBeCloseTo(860, 8);
    expect(view.rank).toBe(3);
    expect(view.positionsValuePts).toBeCloseTo(60, 8);
    expect(view.unrealizedPts).toBeCloseTo(0, 8);
    expect(view.realizedPts).toBe(20);
    expect(view.paidOutPts).toBe(50);
  });

  it('drops a position whose market the api did not send, instead of guessing', () => {
    const view = buildPortfolio(portfolioOf([position(open, { yesShares: 1 })], []));
    expect(view.positions).toEqual([]);
  });
});

describe('positionRows', () => {
  const view = buildPortfolio(
    portfolioOf(
      [
        position(open, { yesShares: 100, yesCostPts: 60, costBasisPts: 60 }),
        position(won, { yesShares: 50, realizedPts: 20, claimed: true, payoutPts: 50, settledAt }),
        position(lost, { yesShares: 40, realizedPts: -25, claimed: true, payoutPts: 0, settledAt }),
      ],
      [open, won, lost],
    ),
  );

  it('splits open from settled and agrees with the portfolio totals', () => {
    const openRows = positionRows(view.positions, 'open');
    const settledRows = positionRows(view.positions, 'settled');
    expect(openRows.map((r) => r.view.marketId)).toEqual([open.id]);
    expect(settledRows.map((r) => r.view.marketId).sort()).toEqual([lost.id, won.id].sort());
    const rows = [...openRows, ...settledRows];
    expect(rows.reduce((a, r) => a + r.valuePts, 0)).toBeCloseTo(view.positionsValuePts + 50, 8);
    expect(rows.reduce((a, r) => a + r.pnlPts, 0)).toBeCloseTo(view.unrealizedPts + view.realizedPts, 8);
  });

  it('prices an open row at the side probability and a settled row at its payout', () => {
    const [row] = positionRows(view.positions, 'open');
    expect(row?.side).toBe('yes');
    expect(row?.avgCost).toBeCloseTo(0.6, 8);
    expect(row?.price).toBeCloseTo(open.probYes, 8);
    expect(row?.valuePts).toBeCloseTo(100 * open.probYes, 8);
    const settled = positionRows(view.positions, 'settled');
    expect(settled.find((r) => r.view.marketId === won.id)).toMatchObject({ valuePts: 50, pnlPts: 20, avgCost: null });
    expect(settled.find((r) => r.view.marketId === lost.id)).toMatchObject({ valuePts: 0, pnlPts: -25 });
  });

  it('gives one row per held side and attributes the realized result once', () => {
    const both = buildPortfolio(
      portfolioOf(
        [
          position(open, {
            yesShares: 10,
            yesCostPts: 5,
            noShares: 20,
            noCostPts: 8,
            costBasisPts: 13,
            realizedPts: 3,
          }),
        ],
        [open],
      ),
    );
    const rows = positionRows(both.positions, 'open');
    expect(rows.map((r) => r.side)).toEqual(['yes', 'no']);
    expect(rows.map((r) => r.first)).toEqual([true, false]);
    expect(rows[1]?.price).toBeCloseTo(1 - open.probYes, 8);
    expect(rows.reduce((a, r) => a + r.pnlPts, 0)).toBeCloseTo(both.unrealizedPts + both.realizedPts, 8);
  });

  it('puts the whole refund of a voided position on its first row', () => {
    const v = buildPortfolio(
      portfolioOf(
        [position(refunded, { yesShares: 10, noShares: 20, realizedPts: 0, claimed: true, payoutPts: 13, settledAt })],
        [refunded],
      ),
    );
    const rows = positionRows(v.positions, 'settled');
    expect(rows.map((r) => r.valuePts)).toEqual([13, 0]);
  });

  it('keeps a fully sold position as a single closed-out row with its realized result', () => {
    const closed = buildPortfolio(portfolioOf([position(open, { realizedPts: -4 }), position(lost, {})], [open, lost]));
    const opens = positionRows(closed.positions, 'open');
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatchObject({ side: null, pnlPts: -4 });
    expect(positionRows(closed.positions, 'settled')).toEqual([]);
  });

  it('is empty for a fresh account', () => {
    expect(positionRows(buildPortfolio(portfolioOf([], [])).positions, 'open')).toEqual([]);
  });
});
