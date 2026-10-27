import { tweetUrl, XDeleted, type XMedia, XPost, type XQuoted } from '@windle/shared';
import type { FeedMediaItem, FeedQuoted, FeedRepost, FeedTweet } from './types';

const MAX_TEXT = 1000;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_ID = /^\d{5,25}$/;
const TWITTER_EPOCH_MS = 1_288_834_974_657n;

const signalsOf = (post: XPost): { signals?: readonly string[] } => (post.signals ? { signals: post.signals } : {});

/** A video or gif shows its poster, never its media file, as the preview image. */
const mapMedia = (media: readonly XMedia[]): FeedMediaItem[] =>
  media.map((m) => {
    const dims = {
      ...(m.width ? { width: m.width } : {}),
      ...(m.height ? { height: m.height } : {}),
      ...(m.altText ? { alt: m.altText } : {}),
    };
    if (m.type === 'image') return { kind: 'image', url: m.url, ...dims };
    return {
      kind: 'video',
      url: m.url,
      ...(m.posterUrl ? { poster: m.posterUrl } : {}),
      ...(m.type === 'gif' ? { gif: true } : {}),
      ...(m.durationMs ? { durationMs: m.durationMs } : {}),
      ...(m.variants?.length ? { variants: m.variants } : {}),
      ...dims,
    };
  });

const bodyText = (text: string, hasMedia: boolean): string =>
  text.trim().slice(0, MAX_TEXT) || (hasMedia ? 'Media post' : '');

/** Creation time of a snowflake id; null for ids that predate snowflakes. */
function snowflakeTime(id: string): string | null {
  const ms = (BigInt(id) >> 22n) + TWITTER_EPOCH_MS;
  return ms > TWITTER_EPOCH_MS ? new Date(Number(ms)).toISOString() : null;
}

function mapQuoted(q: XQuoted): FeedQuoted {
  return {
    handle: q.author.handle,
    name: q.author.name,
    avatarUrl: q.author.avatarUrl ?? undefined,
    text: q.text,
    url: q.id ? `https://x.com/${q.author.handle}/status/${q.id}` : undefined,
    media: mapMedia(q.media),
  };
}

/**
 * A repost has no text or media of its own: the row shows the original from `quoted` under a "reposted" line, and a
 * market from it is about the original, which needs the original's id and author.
 */
function mapRepost(post: XPost): FeedTweet | null {
  const q = post.quoted;
  if (!q) return null;
  const media = mapMedia(q.media);
  const text = bodyText(q.text, media.length > 0);
  if (text === '') return null;
  const known = HANDLE.test(q.author.handle);
  const author = known
    ? { handle: q.author.handle, name: q.author.name || q.author.handle, avatarUrl: q.author.avatarUrl ?? undefined }
    : { handle: post.author.handle, name: post.author.name || post.author.handle, avatarUrl: undefined };
  if (author.handle.length > 15) return null;
  const createdAt = q.id && STATUS_ID.test(q.id) ? snowflakeTime(q.id) : null;
  const original =
    known && q.id && createdAt
      ? {
          id: q.id,
          url: tweetUrl(author.handle, q.id),
          author,
          text,
          createdAt,
          capturedAt: post.receivedAt,
          ...(media.length > 0 ? { media } : {}),
          ...(q.card ? { card: q.card } : {}),
        }
      : null;
  const repost: FeedRepost = {
    by: { handle: post.author.handle, name: post.author.name || post.author.handle },
    original,
  };
  return {
    id: post.id,
    url: original?.url ?? post.url,
    author,
    text,
    createdAt: post.createdAt,
    capturedAt: post.receivedAt,
    ...(media.length > 0 ? { media } : {}),
    ...(q.card ? { card: q.card } : {}),
    feed: {
      kind: post.kind,
      tags: post.author.tags,
      replyTo: null,
      quoted: null,
      repost,
      deleted: false,
      ...signalsOf(post),
    },
  };
}

/**
 * Maps a validated post onto the tweet snapshot the feed and the create wizard use. A post with neither text nor media
 * (nor, for a repost, an original with either) has nothing to show and nothing to bet on, so it maps to `null`.
 */
export function mapPost(post: XPost): FeedTweet | null {
  if (post.kind === 'repost') return mapRepost(post);
  const media = mapMedia(post.media);
  const text = bodyText(post.text, media.length > 0);
  if (text === '' || post.author.handle.length > 15) return null;
  return {
    id: post.id,
    url: post.url,
    author: {
      handle: post.author.handle,
      name: post.author.name || post.author.handle,
      avatarUrl: post.author.avatarUrl ?? undefined,
    },
    text,
    createdAt: post.createdAt,
    capturedAt: post.receivedAt,
    ...(media.length > 0 ? { media } : {}),
    ...(post.card ? { card: post.card } : {}),
    ...(post.metrics ? { metrics: post.metrics } : {}),
    feed: {
      kind: post.kind,
      tags: post.author.tags,
      replyTo: post.inReplyTo?.handle ?? null,
      quoted: post.quoted ? mapQuoted(post.quoted) : null,
      repost: null,
      deleted: false,
      ...signalsOf(post),
    },
  };
}

const parseJson = (data: unknown): unknown => {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
};

export function parsePost(data: unknown): FeedTweet | null {
  return parsePostValue(parseJson(data));
}

/** A post already decoded from JSON, as `GET /v1/x/post/:id` returns it. */
export function parsePostValue(raw: unknown): FeedTweet | null {
  const parsed = XPost.safeParse(raw);
  return parsed.success ? mapPost(parsed.data) : null;
}

/** Valid posts of a `snapshot` event; invalid entries are dropped one by one, not the whole batch. */
export function parseSnapshot(data: unknown): FeedTweet[] | null {
  const json = parseJson(data);
  if (typeof json !== 'object' || json === null || !('posts' in json) || !Array.isArray(json.posts)) return null;
  const out: FeedTweet[] = [];
  for (const raw of json.posts as unknown[]) {
    const parsed = XPost.safeParse(raw);
    const tweet = parsed.success ? mapPost(parsed.data) : null;
    if (tweet) out.push(tweet);
  }
  return out;
}

export function parseDeleted(data: unknown): string | null {
  const parsed = XDeleted.safeParse(parseJson(data));
  return parsed.success ? parsed.data.id : null;
}
