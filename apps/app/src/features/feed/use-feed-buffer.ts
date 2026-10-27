import { useEffect, useRef, useState } from 'react';
import type { FeedTweet } from './types';

export interface FeedBuffer {
  shown: readonly FeedTweet[];
  /** Tweets that arrived while `hold` was on and are waiting behind the "new posts" pill. */
  pending: number;
  reveal: () => void;
}

export interface FeedCadence {
  /** Minimum time between reveals; arrivals in between are queued and shown together. */
  everyMs: number;
  /** Most rows one reveal may add; the rest wait for the next one. */
  maxRows: number;
}

/**
 * Splits a newest-first list into what is on screen and what waits. While `hold` is on, the head of the list is
 * frozen at the newest tweet that was visible when the hold began; when it ends, everything is shown at once. Without a
 * hold, `cadence` meters new rows out in batches, so a busy stream moves the list a few times a minute rather than
 * every second; the first row after a quiet spell is not delayed. A new `resetKey` (the active filter) starts over
 * from the newest row, since the list underneath is a different one.
 */
export function useFeedBuffer(
  tweets: readonly FeedTweet[],
  hold: boolean,
  cadence?: FeedCadence,
  resetKey?: string,
): FeedBuffer {
  const newest = tweets[0]?.id;
  const [head, setHead] = useState(newest);
  const [wasHeld, setWasHeld] = useState(hold);
  const [seenKey, setSeenKey] = useState(resetKey);
  const latest = useRef(tweets);
  const lastReveal = useRef(Number.NEGATIVE_INFINITY);

  const at = head === undefined ? 0 : tweets.findIndex((t) => t.id === head);
  const metered = cadence !== undefined && !hold && at > 0;
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setHead(newest);
  } else if (wasHeld !== hold) {
    setWasHeld(hold);
    if (!hold && head !== newest) setHead(newest);
  } else if (!hold && head !== newest && !metered) {
    setHead(newest);
  }

  useEffect(() => {
    latest.current = tweets;
  });

  const everyMs = cadence?.everyMs;
  const maxRows = cadence?.maxRows;
  const waiting = metered && head !== newest;
  useEffect(() => {
    if (!waiting || everyMs === undefined || maxRows === undefined) return;
    const wait = Math.max(0, lastReveal.current + everyMs - Date.now());
    const id = window.setTimeout(() => {
      const list = latest.current;
      lastReveal.current = Date.now();
      const from = head === undefined ? -1 : list.findIndex((t) => t.id === head);
      setHead(from <= 0 ? list[0]?.id : list[Math.max(0, from - maxRows)]?.id);
    }, wait);
    return () => window.clearTimeout(id);
  }, [waiting, head, everyMs, maxRows]);

  const from = at > 0 ? at : 0;
  return {
    shown: from === 0 ? tweets : tweets.slice(from),
    pending: hold ? from : 0,
    reveal: () => setHead(newest),
  };
}

/** Where scrollTop must land so the rows under the viewport stay put after rows were added above them. */
export function anchoredScrollTop(scrollTop: number, heightBefore: number, heightAfter: number): number {
  return scrollTop > 0 ? scrollTop + (heightAfter - heightBefore) : scrollTop;
}

/** Announces the pending count at most once per `everyMs`, and clears it as soon as nothing is pending. */
export function useThrottledCount(count: number, everyMs: number): number {
  const [announced, setAnnounced] = useState(0);
  const last = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (count === 0) {
      setAnnounced(0);
      return;
    }
    const wait = Math.max(0, last.current + everyMs - Date.now());
    const id = window.setTimeout(() => {
      last.current = Date.now();
      setAnnounced(count);
    }, wait);
    return () => window.clearTimeout(id);
  }, [count, everyMs]);

  return announced;
}
