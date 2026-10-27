import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePref } from '@/features/settings/prefs';
import { defaultFeed } from './auto-feed';
import type { FeedConnection, FeedTweet, TweetFeedSource } from './types';

export interface TweetFeed {
  kind: TweetFeedSource['kind'];
  tweets: readonly FeedTweet[];
  /** True when the user paused it or the "Live feed" setting is off. */
  paused: boolean;
  /** The setting, not the button, is what holds the feed: the pause button cannot override it. */
  liveOff: boolean;
  toggle: () => void;
  /** Connection of the live stream; absent for a purely simulated feed. */
  connection?: FeedConnection | undefined;
  /** Tells the source whether the reader is idle at the top, the only moment it may swap the whole list. */
  settle?: ((atRest: boolean) => void) | undefined;
}

/**
 * Subscribes to a source for as long as the calling page is mounted and maps the pause controls onto it. Reduced
 * motion is deliberately not an input: it changes how rows arrive, never whether they do.
 */
export function useTweetFeed(source: TweetFeedSource = defaultFeed()): TweetFeed {
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const liveOff = usePref('live') === 'off';
  const [userPaused, setUserPaused] = useState(false);
  const paused = userPaused || liveOff;

  useEffect(() => {
    if (paused) source.pause();
    else source.resume();
  }, [source, paused]);

  return {
    kind: source.kind,
    tweets: snapshot.tweets,
    paused,
    liveOff,
    toggle: () => setUserPaused((p) => !p),
    connection: snapshot.connection,
    settle: source.settle?.bind(source),
  };
}
