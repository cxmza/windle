import type { Market } from '../markets/types';
import type { ActivityEvent, Project } from '../projects/types';

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type Side = 'ship' | 'slash';

interface EventBase {
  id: string;
  at: number;
  marketId: string;
  ticker: string;
  team: string;
  amountSol: number;
}

export interface TradeEvent extends EventBase {
  kind: 'trade';
  side: Side;
  shares: number;
  price: number;
  from: number;
  to: number;
}

export interface PromiseEvent extends EventBase {
  kind: 'promise';
}

export type LiveEvent = TradeEvent | PromiseEvent;

export const FEED = {
  odds: { min: 3, max: 97, band: 10, step: [1, 3] },
  delay: { min: 2500, max: 7000 },
  promiseChance: 0.12,
  keepEvents: 24,
  keepActivity: 12,
} as const;

export interface LiveSnapshot {
  version: number;
  events: readonly LiveEvent[];
  paused: boolean;
}

export interface LiveFeed {
  snapshot(): LiveSnapshot;
  subscribe(listener: () => void): () => void;
  step(at: number): LiveEvent | null;
  nextDelay(): number;
  setPaused(paused: boolean): void;
  odds(marketId: string): number | undefined;
  applyMarket(m: Market): Market;
  applyMarkets(list: readonly Market[]): readonly Market[];
  applyProjects(list: readonly Project[]): readonly Project[];
}

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, items: readonly T[]): T | undefined => items[Math.floor(rng() * items.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function oddsBounds(base: number): [number, number] {
  return [Math.max(FEED.odds.min, base - FEED.odds.band), Math.min(FEED.odds.max, base + FEED.odds.band)];
}

export function activityOf(e: LiveEvent): ActivityEvent {
  const at = new Date(e.at).toISOString();
  if (e.kind === 'promise') {
    return {
      id: e.id,
      kind: 'promise',
      text: `Locked ${e.amountSol} SOL behind the next promise`,
      at,
      amountSol: e.amountSol,
    };
  }
  return {
    id: e.id,
    kind: 'trade',
    text: `${cap(e.side)} +${e.shares} shares at ${e.price.toFixed(2)}`,
    at,
    amountSol: e.amountSol,
  };
}

/**
 * Sample-data market activity. `universe` fixes which markets exist and their base odds; the feed only ever
 * overlays odds and appends activity, so a fresh fixture list and a cached one converge to the same view.
 */
export function createLiveFeed({ seed, universe }: { seed: number; universe: readonly Market[] }): LiveFeed {
  const rng = mulberry32(seed);
  const base = new Map(universe.map((m) => [m.id, m.shipProbability]));
  const odds = new Map<string, number>();
  const activity = new Map<string, ActivityEvent[]>();
  const listeners = new Set<() => void>();
  let seq = 0;
  let snap: LiveSnapshot = { version: 0, events: [], paused: false };

  const publish = (patch: Partial<LiveSnapshot>) => {
    snap = { ...snap, ...patch, version: snap.version + 1 };
    for (const l of listeners) l();
  };

  const record = (e: LiveEvent) => {
    const rows = activity.get(e.marketId) ?? [];
    activity.set(e.marketId, [activityOf(e), ...rows].slice(0, FEED.keepActivity));
    publish({ events: [e, ...snap.events].slice(0, FEED.keepEvents) });
  };

  const trade = (at: number): TradeEvent | null => {
    const m = pick(
      rng,
      universe.filter((x) => x.status === 'live'),
    );
    if (!m) return null;
    const b = base.get(m.id) ?? m.shipProbability;
    const from = odds.get(m.id) ?? b;
    const [lo, hi] = oddsBounds(b);
    const pull = Math.max(-0.4, Math.min(0.4, (b - from) / (2 * FEED.odds.band)));
    const side: Side = rng() < 0.5 + pull ? 'ship' : 'slash';
    const d = int(rng, FEED.odds.step[0], FEED.odds.step[1]);
    const to = Math.max(lo, Math.min(hi, from + (side === 'ship' ? d : -d)));
    odds.set(m.id, to);
    const price = (side === 'ship' ? to : 100 - to) / 100;
    const shares = int(rng, 2, 60) * 5;
    seq += 1;
    return {
      kind: 'trade',
      id: `live-${seed}-${seq}`,
      at,
      marketId: m.id,
      ticker: m.ticker,
      team: m.team,
      side,
      shares,
      price,
      amountSol: Math.max(1, Math.round(shares * price)),
      from,
      to,
    };
  };

  const promise = (at: number): PromiseEvent | null => {
    const m = pick(
      rng,
      universe.filter((x) => x.status === 'shipped' || x.status === 'slashed'),
    );
    if (!m) return null;
    seq += 1;
    return {
      kind: 'promise',
      id: `live-${seed}-${seq}`,
      at,
      marketId: m.id,
      ticker: m.ticker,
      team: m.team,
      amountSol: int(rng, 4, 40) * 10,
    };
  };

  const applyMarket = (m: Market): Market => {
    const o = odds.get(m.id);
    return o === undefined || o === m.shipProbability ? m : { ...m, shipProbability: o };
  };

  return {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    step(at) {
      const e = (rng() < FEED.promiseChance ? promise(at) : null) ?? trade(at);
      if (e) record(e);
      return e;
    },
    nextDelay: () => int(rng, FEED.delay.min, FEED.delay.max),
    setPaused(paused) {
      if (paused !== snap.paused) publish({ paused });
    },
    odds: (id) => odds.get(id),
    applyMarket,
    applyMarkets(list) {
      const next = list.map(applyMarket);
      return next.every((m, i) => m === list[i]) ? list : next;
    },
    applyProjects(list) {
      const next = list.map((p) => {
        const current = applyMarket(p.current);
        const live = activity.get(p.current.id) ?? [];
        const known = new Set(p.activity.map((a) => a.id));
        const fresh = live.filter((a) => !known.has(a.id));
        if (current === p.current && fresh.length === 0) return p;
        return { ...p, current, activity: [...fresh, ...p.activity].slice(0, FEED.keepActivity) };
      });
      return next.every((p, i) => p === list[i]) ? list : next;
    },
  };
}

export interface DriverEnv {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  hidden: () => boolean;
  onVisibilityChange: (fn: () => void) => () => void;
}

export const browserEnv = (): DriverEnv => ({
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  hidden: () => document.visibilityState === 'hidden',
  onVisibilityChange: (fn) => {
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  },
});

/** Emits feed events on a randomised cadence; idle while the tab is hidden or the feed is paused. */
export function startDriver(feed: LiveFeed, env: DriverEnv): () => void {
  let timer: number | null = null;
  const clear = () => {
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    clear();
    if (env.hidden() || feed.snapshot().paused) return;
    timer = env.setTimeout(() => {
      timer = null;
      feed.step(env.now());
      schedule();
    }, feed.nextDelay());
  };
  let paused = feed.snapshot().paused;
  const unsubscribe = feed.subscribe(() => {
    const p = feed.snapshot().paused;
    if (p === paused) return;
    paused = p;
    schedule();
  });
  const off = env.onVisibilityChange(schedule);
  schedule();
  return () => {
    clear();
    off();
    unsubscribe();
  };
}
