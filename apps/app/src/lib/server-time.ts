import { useSyncExternalStore } from 'react';

const MAX_RTT_MS = 5_000;
const KEEP_MS = 5 * 60_000;

interface Sample {
  offset: number;
  rtt: number;
  at: number;
}

let best: Sample | null = null;
let floor = Number.NEGATIVE_INFINITY;
let offset = 0;
const listeners = new Set<() => void>();

function publish(next: number) {
  if (next === offset) return;
  offset = next;
  for (const l of listeners) l();
}

/** Milliseconds to add to `Date.now()` to get the server's time; 0 until the first observation. */
export const serverOffset = (): number => offset;

export const serverNow = (): number => Date.now() + offset;

/**
 * A server timestamp read at the moment a response arrived. `Date` headers have one-second resolution, so the true
 * time is taken to be the middle of that second; the sample with the shortest round trip wins for five minutes.
 */
export function observeServerTime(serverMs: number, sentAt: number, receivedAt: number, resolutionMs = 1000): void {
  const rtt = receivedAt - sentAt;
  if (!Number.isFinite(serverMs) || rtt < 0 || rtt > MAX_RTT_MS) return;
  const sample: Sample = { offset: serverMs + resolutionMs / 2 - (sentAt + receivedAt) / 2, rtt, at: receivedAt };
  if (!best || rtt <= best.rtt || receivedAt - best.at > KEEP_MS) best = sample;
  publish(Math.max(Math.round(best.offset), floor));
}

/** The `Date` header of a response (readable cross-origin only when the api exposes it). */
export function observeResponse(res: Pick<Response, 'headers'>, sentAt: number, receivedAt: number): void {
  const raw = res.headers.get('date');
  if (raw) observeServerTime(Date.parse(raw), sentAt, receivedAt);
}

/** A moment the server has certainly passed (e.g. when it received a post): the offset can only be at least this. */
export function observeServerLowerBound(serverMs: number): void {
  if (!Number.isFinite(serverMs)) return;
  floor = Math.max(floor, serverMs - Date.now());
  if (offset < floor) publish(Math.round(floor));
}

export function resetServerTime(): void {
  best = null;
  floor = Number.NEGATIVE_INFINITY;
  publish(0);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useServerOffset = (): number => useSyncExternalStore(subscribe, serverOffset, serverOffset);
