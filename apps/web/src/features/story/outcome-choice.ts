import { useSyncExternalStore } from 'react';

/**
 * Which ending the reader picked in the outcome chapter, as an external store for React and the 3D layer.
 *
 *   null     = the reader has not interacted (or went back to "follow scroll"): the scene follows scroll progress
 *   'ship'   = reader chose SHIP  -> 3D should show the SHIP ending regardless of scroll
 *   'slash'  = reader chose SLASH -> likewise
 *
 *   import { subscribe, getSnapshot } from './outcome-choice';   // useSyncExternalStore(subscribe, getSnapshot)
 */

export type OutcomeChoice = 'ship' | 'slash' | null;

let choice: OutcomeChoice = null;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): OutcomeChoice {
  return choice;
}

export const getServerSnapshot = getSnapshot;

export function setChoice(next: OutcomeChoice): void {
  if (next === choice) return;
  choice = next;
  for (const listener of listeners) listener();
}

/** Back to following the scroll. */
export function clearChoice(): void {
  setChoice(null);
}

export function useOutcomeChoice(): OutcomeChoice {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
