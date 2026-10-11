import { useSyncExternalStore } from 'react';
import { EXAMPLE_MARKET } from './chapters';
import { type Inventory, inventoryForPrice, lmsrPriceYes, type Side, sharesForStake } from './lmsr';

/**
 * Local, in-memory demo market (NO chain, NO funds). External store for React and the 3D layer:
 *
 *   import { subscribe, getSnapshot } from './demo-market';           // useSyncExternalStore(subscribe, getSnapshot)
 *   import { useDemoMarket, buy, reset } from './demo-market';        // React convenience + actions
 *
 * The snapshot is immutable and replaced on every change (reference equality = "something changed").
 */

/** LMSR liquidity: with STAKE below, one buy moves the price by roughly 4-5 cents near 72. */
export const LIQUIDITY = 50;
/** Demo USDC spent per click. */
export const STAKE = 10;

export type DemoPosition = {
  /** Shares held (each pays 1 demo USDC if its side wins). */
  readonly yesShares: number;
  readonly noShares: number;
  /** Total demo USDC spent. */
  readonly spent: number;
  /** Mark-to-market value at the current price. */
  readonly value: number;
};

export type DemoTrade = { readonly side: Side; readonly stake: number; readonly shares: number };

export type DemoMarketSnapshot = {
  /** Whole cents, yes + no === 100. This is what the UI shows. */
  readonly yes: number;
  readonly no: number;
  /** Exact YES probability in (0, 1): use this for smooth 3D (slab heights etc.). */
  readonly probYes: number;
  readonly position: DemoPosition;
  /** Number of buys since the last reset. 0 = untouched example state. */
  readonly trades: number;
  /** The most recent buy (null after reset): lets motion react to the side that moved the price. */
  readonly lastTrade: DemoTrade | null;
  /** Increments on every buy and reset; use as an effect key to retrigger animations. */
  readonly version: number;
};

type State = {
  q: Inventory;
  yesShares: number;
  noShares: number;
  spent: number;
  trades: number;
  last: DemoTrade | null;
  version: number;
};

const OPENING_PROB = EXAMPLE_MARKET.yes / 100;
const OPENING_Q = inventoryForPrice(OPENING_PROB, LIQUIDITY);

const initial = (version: number): State => ({
  q: OPENING_Q,
  yesShares: 0,
  noShares: 0,
  spent: 0,
  trades: 0,
  last: null,
  version,
});

function toSnapshot(s: State): DemoMarketSnapshot {
  const probYes = lmsrPriceYes(s.q, LIQUIDITY);
  const yes = Math.min(99, Math.max(1, Math.round(probYes * 100)));
  return {
    yes,
    no: 100 - yes,
    probYes,
    position: {
      yesShares: s.yesShares,
      noShares: s.noShares,
      spent: s.spent,
      value: s.yesShares * probYes + s.noShares * (1 - probYes),
    },
    trades: s.trades,
    lastTrade: s.last,
    version: s.version,
  };
}

let state = initial(0);
let snapshot = toSnapshot(state);
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  snapshot = toSnapshot(next);
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): DemoMarketSnapshot {
  return snapshot;
}

export const getServerSnapshot = getSnapshot;

/** Spend `stake` demo USDC on `side`. */
export function buy(side: Side, stake: number = STAKE): void {
  if (!Number.isFinite(stake) || stake <= 0) return;
  const shares = sharesForStake(state.q, side, stake, LIQUIDITY);
  commit({
    q: side === 'yes' ? { yes: state.q.yes + shares, no: state.q.no } : { yes: state.q.yes, no: state.q.no + shares },
    yesShares: state.yesShares + (side === 'yes' ? shares : 0),
    noShares: state.noShares + (side === 'no' ? shares : 0),
    spent: state.spent + stake,
    trades: state.trades + 1,
    last: { side, stake, shares },
    version: state.version + 1,
  });
}

/** Back to the opening example (72 / 28, empty position). */
export function reset(): void {
  commit(initial(state.version + 1));
}

export function useDemoMarket(): DemoMarketSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
