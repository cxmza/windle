import { useSyncExternalStore } from 'react';

type Unit = 'second' | 'minute';
const STEP: Record<Unit, number> = { second: 1000, minute: 60_000 };

const listeners: Record<Unit, Set<() => void>> = { second: new Set(), minute: new Set() };
const timers: Record<Unit, number | null> = { second: null, minute: null };
const snap: Record<Unit, number> = { second: 0, minute: 0 };

const floorTo = (unit: Unit, t: number) => t - (t % STEP[unit]);

function arm(unit: Unit) {
  const now = Date.now();
  timers[unit] = window.setTimeout(
    () => {
      snap[unit] = floorTo(unit, Date.now() + 5);
      for (const l of listeners[unit]) l();
      arm(unit);
    },
    STEP[unit] - (now % STEP[unit]),
  );
}

function subscribe(unit: Unit, listener: () => void) {
  listeners[unit].add(listener);
  if (timers[unit] === null) {
    snap[unit] = floorTo(unit, Date.now());
    arm(unit);
  }
  return () => {
    listeners[unit].delete(listener);
    if (listeners[unit].size === 0 && timers[unit] !== null) {
      window.clearTimeout(timers[unit]);
      timers[unit] = null;
    }
  };
}

const read = (unit: Unit) => {
  if (timers[unit] === null) snap[unit] = floorTo(unit, Date.now());
  return snap[unit];
};

const sub = { second: (l: () => void) => subscribe('second', l), minute: (l: () => void) => subscribe('minute', l) };
const get = { second: () => read('second'), minute: () => read('minute') };
const frozen = () => () => {};

/**
 * A wall clock shared by every component on the page, ticking exactly on the second (or minute) boundary, so all
 * countdowns change together. Disabled: the value is read once and does not tick.
 */
export function useClock(unit: Unit, enabled = true): number {
  return useSyncExternalStore(enabled ? sub[unit] : frozen, get[unit], get[unit]);
}
