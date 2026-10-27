import type { TweetMedia, TweetSnapshot, XAuthorTag, XPostKind } from '@windle/shared';

/** A video or gif carries the still frame to show in place of the media file; the file itself is never an image. */
export type FeedMediaItem = TweetMedia;

export interface FeedQuoted {
  readonly handle: string;
  readonly name: string;
  readonly avatarUrl: string | undefined;
  readonly text: string;
  readonly url: string | undefined;
  readonly media: readonly FeedMediaItem[];
}

export interface FeedRepost {
  /** Who reposted; the row itself shows the original author, text and media. */
  readonly by: { readonly handle: string; readonly name: string };
  /** The original tweet a market would be made from; null when the relay could not identify it. */
  readonly original: TweetSnapshot | null;
}

/** What a live post carries beyond the stored tweet snapshot. Simulated tweets have none of it. */
export interface FeedExtras {
  readonly kind: XPostKind;
  readonly tags: readonly XAuthorTag[];
  readonly replyTo: string | null;
  readonly quoted: FeedQuoted | null;
  readonly repost: FeedRepost | null;
  readonly deleted: boolean;
  /** Why the relay thinks the post is about crypto (cashtag, ca_sol, ca_evm, link, keyword); absent on older payloads. */
  readonly signals?: readonly string[];
}

export type FeedTweet = Omit<TweetSnapshot, 'media'> & {
  readonly media?: TweetMedia[];
  readonly feed?: FeedExtras;
};

/** Id of the tweet a market from this row is about; null for a repost whose original is unknown. */
export const sourceId = (tweet: FeedTweet): string | null =>
  tweet.feed?.repost ? (tweet.feed.repost.original?.id ?? null) : tweet.id;

/** The tweet a market is made from and keyed by: the original of a repost, the post itself otherwise. */
export function sourceTweet(tweet: FeedTweet): TweetSnapshot | null {
  const { feed, media, ...rest } = tweet;
  if (feed?.repost) return feed.repost.original;
  return media ? { ...rest, media: [...media] } : rest;
}

export type TweetKind = 'promise' | 'update' | 'other';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

export interface FeedConnection {
  readonly status: ConnectionStatus;
  /** Consecutive failed attempts since the last snapshot. */
  readonly failures: number;
  /** True once this source has delivered a snapshot. */
  readonly everLive: boolean;
}

export interface FeedSnapshot {
  /** Newest first. The array identity changes only when a tweet is added or the paused flag flips. */
  readonly tweets: readonly FeedTweet[];
  readonly paused: boolean;
  /** Present for sources that hold a connection. */
  readonly connection?: FeedConnection;
}

/** The seam between the feed UI and wherever tweets come from: a simulator or the live X stream. */
export interface TweetFeedSource {
  /** `sample` while the tweets are simulated; the UI labels them until a source reports `live`. May change over time. */
  readonly kind: 'sample' | 'live';
  subscribe(listener: () => void): () => void;
  getSnapshot(): FeedSnapshot;
  pause(): void;
  resume(): void;
  /** The list reports whether the reader is idle at the top; a source may swap its whole list only then. */
  settle?(atRest: boolean): void;
}
