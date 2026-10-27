import {
  type Inventory,
  inventoryForPrice,
  lmsrCost,
  type MarketSide,
  MIN_TRADE_PTS,
  type TradeRequest,
  withShares,
} from '@windle/shared';
import type { BotState } from '../types.ts';

/**
 * The house bots' price model, pure (no I/O, randomness injected).
 *
 * Per market a latent fair value x (log-odds of YES) follows an Ornstein–Uhlenbeck process
 *     dx = θ (μ − x) dt + σ dW,
 * sampled with its exact transition over any elapsed Δ (hours), so the tick rate does not change the statistics:
 *     x(t+Δ) ~ N( μ + (x − μ) e^(−θΔ),  σ² (1 − e^(−2θΔ)) / (2θ) ).
 * Stationary spread around μ is σ / √(2θ); with the defaults (θ = 2/h, σ = 0.25/√h) that is 0.125 in log-odds, about
 * ±3 pp at a 50 % price, and the hourly change has a standard deviation of about 4 pp.
 *
 * The anchor μ belongs to the humans. It starts at the market's price; after each human trade it moves toward that
 * trade's post-trade log-odds L by an EMA step (weight α) and x moves by the same amount, so the bots keep their
 * current wobble but re-centre on the humans. Between human trades μ also relaxes toward the last human L at rate κ,
 * so the (1 − α) the EMA held back is handed over within ~1/κ: the bots never keep fighting a human price.
 *
 * A bot then trades the LMSR price toward p* = sigmoid(x), at most `maxStepPp` per trade and `maxStakePts` per buy,
 * and not at all inside the dead band.
 */

/** Uniform [0, 1). */
export type Rng = () => number;

export interface OuParams {
  /** Mean reversion θ, per hour. */
  thetaPerHour: number;
  /** Volatility σ, log-odds per √hour. */
  sigma: number;
  /** Rate κ at which μ relaxes toward the last human price, per hour (0: only the EMA step). */
  anchorFollowPerHour: number;
}

export interface TradeCaps {
  maxStakePts: number;
  /** Largest price move one bot trade may cause, in probability points (0.03 = 3 pp). */
  maxStep: number;
  /** No trade while |p − p*| is below this, in probability points. */
  deadBand: number;
}

/**
 * Bots trade only inside this band and never aim outside it: they do not push a market toward certainty, and a price
 * people have taken beyond it is theirs (no bot trade at all there).
 */
export const P_MIN = 0.03;
export const P_MAX = 0.97;
/** A bot sells a holding only above this many shares; smaller remainders are left alone. */
export const MIN_SELL_SHARES = 0.01;

const HOUR_MS = 3_600_000;

export const clampP = (p: number): number => Math.min(P_MAX, Math.max(P_MIN, p));
export const logit = (p: number): number => {
  const c = Math.min(1 - 1e-9, Math.max(1e-9, p));
  return Math.log(c / (1 - c));
};
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Standard normal by Box–Muller; `1 − rng()` keeps the log argument in (0, 1]. */
export function gaussian(rng: Rng): number {
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Deterministic PRNG (mulberry32) for tests and reproducible runs. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Exact OU transition moments over `dtHours`. */
export function ouMoments(x: number, mu: number, dtHours: number, p: Pick<OuParams, 'thetaPerHour' | 'sigma'>) {
  const decay = Math.exp(-p.thetaPerHour * dtHours);
  return {
    mean: mu + (x - mu) * decay,
    variance: (p.sigma * p.sigma * (1 - decay * decay)) / (2 * p.thetaPerHour),
  };
}

export function initialState(marketId: string, probYes: number, now: Date): BotState {
  const x = logit(probYes);
  return { marketId, x, mu: x, humanX: x, steppedAt: now };
}

/** Advances μ (toward the last human price) and then x (OU toward μ) to `now`. */
export function advance(state: BotState, now: Date, params: OuParams, rng: Rng): BotState {
  const dt = (now.getTime() - state.steppedAt.getTime()) / HOUR_MS;
  if (!(dt > 0)) return state;
  const mu = state.humanX + (state.mu - state.humanX) * Math.exp(-params.anchorFollowPerHour * dt);
  const { mean, variance } = ouMoments(state.x, mu, dt, params);
  return { ...state, mu, x: mean + Math.sqrt(variance) * gaussian(rng), steppedAt: now };
}

/** A human trade left the market at `priceAfter`: EMA step of μ toward it, x shifted along. */
export function followHumanTrade(state: BotState, priceAfter: number, alpha: number): BotState {
  const humanX = logit(priceAfter);
  const shift = alpha * (humanX - state.mu);
  return { ...state, mu: state.mu + shift, x: state.x + shift, humanX };
}

export interface PlanInput {
  probYes: number;
  target: number;
  inventory: Inventory;
  liquidityB: number;
  held: { yes: number; no: number };
  caps: TradeCaps;
}

/**
 * The single trade that moves the LMSR price from `probYes` toward `target`, capped, or null. Raising YES means
 * selling held NO shares if the bot has any (that shrinks its inventory), otherwise buying YES; and the mirror image.
 */
export function planBotTrade(input: PlanInput): TradeRequest | null {
  const { probYes, inventory: q, liquidityB: b, held, caps } = input;
  if (probYes < P_MIN || probYes > P_MAX) return null;
  const target = clampP(input.target);
  const gap = target - probYes;
  if (!(Math.abs(gap) >= caps.deadBand)) return null;
  const goal = probYes + Math.sign(gap) * Math.min(Math.abs(gap), caps.maxStep);
  const want = inventoryForPrice(goal, b);
  // Moving the price only depends on q.yes − q.no: buying d YES and selling d NO move it alike.
  const shares = Math.abs(want.yes - want.no - (q.yes - q.no));
  if (!(shares > 0)) return null;
  const buySide: MarketSide = gap > 0 ? 'yes' : 'no';
  const sellSide: MarketSide = gap > 0 ? 'no' : 'yes';
  const holding = held[sellSide];
  if (holding >= MIN_SELL_SHARES) return { action: 'sell', side: sellSide, shares: Math.min(holding, shares) };
  const cost = lmsrCost(withShares(q, buySide, shares), b) - lmsrCost(q, b);
  const amountPts = Math.floor(Math.min(cost, caps.maxStakePts) * 1_000_000) / 1_000_000;
  if (amountPts < MIN_TRADE_PTS) return null;
  return { action: 'buy', side: buySide, amountPts };
}
