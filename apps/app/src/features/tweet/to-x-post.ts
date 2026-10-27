import type { XMedia, XPost } from '@windle/shared';
import type { FeedMediaItem, FeedTweet } from '../feed/types';

const toMedia = (m: FeedMediaItem): XMedia => ({
  type: m.kind === 'image' ? 'image' : m.gif ? 'gif' : 'video',
  url: m.url,
  ...(m.poster ? { posterUrl: m.poster } : {}),
  ...(m.width ? { width: m.width } : {}),
  ...(m.height ? { height: m.height } : {}),
  ...(m.alt ? { altText: m.alt } : {}),
  ...(m.durationMs ? { durationMs: m.durationMs } : {}),
  ...(m.variants ? { variants: [...m.variants] } : {}),
});

/**
 * A stored snapshot or a feed row as a post, for when the full post is not at hand: the view then shows exactly what
 * that copy holds, and nothing invented.
 */
export function toXPost(tweet: FeedTweet): XPost {
  const { feed, author } = tweet;
  const quoted = feed?.quoted ?? null;
  return {
    id: tweet.id,
    kind: feed?.kind ?? 'tweet',
    createdAt: tweet.createdAt,
    receivedAt: tweet.capturedAt,
    url: tweet.url,
    author: {
      id: null,
      handle: author.handle,
      name: author.name,
      avatarUrl: author.avatarUrl ?? null,
      followers: null,
      tags: feed ? [...feed.tags] : [],
      verified: author.verified ? 'blue' : 'none',
    },
    text: tweet.text,
    media: (tweet.media ?? []).map(toMedia),
    ...(tweet.card ? { card: tweet.card } : {}),
    ...(tweet.metrics ? { metrics: tweet.metrics } : {}),
    quoted: quoted
      ? {
          id: quoted.url?.split('/').pop() ?? null,
          author: { handle: quoted.handle, name: quoted.name, avatarUrl: quoted.avatarUrl ?? null },
          text: quoted.text,
          media: quoted.media.map(toMedia),
        }
      : null,
    inReplyTo: feed?.replyTo ? { id: null, handle: feed.replyTo } : null,
    source: 'gmgn',
  };
}
