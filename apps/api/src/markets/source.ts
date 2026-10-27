import type { TweetMedia, TweetSnapshot, XMedia, XPost } from '@windle/shared';
import type { AppContext } from '../context.ts';
import { HttpError } from '../errors.ts';
import { XEnrichUnavailable } from '../x-feed/enrich.ts';
import { XFeedUnavailable } from '../x-feed/hub.ts';

const MAX_TEXT = 1000;

function mapMedia(media: readonly XMedia[]): TweetMedia[] {
  return media.map((m) => {
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
      ...(m.variants?.length ? { variants: m.variants.slice(0, 12) } : {}),
      ...dims,
    };
  });
}

/** The server's own snapshot of a post (same mapping as the app's feed), keeping only what the client cannot fake. */
function snapshotOf(post: XPost, fallback: TweetSnapshot, now: Date): TweetSnapshot {
  const media = mapMedia(post.media);
  const text = post.text.trim().slice(0, MAX_TEXT) || (media.length > 0 ? 'Media post' : fallback.text);
  const verified = post.author.verified === undefined ? fallback.author.verified : post.author.verified !== 'none';
  return {
    id: post.id,
    url: post.url,
    author: {
      handle: post.author.handle,
      name: (post.author.name || post.author.handle).slice(0, 80),
      ...(post.author.avatarUrl ? { avatarUrl: post.author.avatarUrl } : {}),
      ...(verified === undefined ? {} : { verified }),
    },
    text,
    createdAt: post.createdAt,
    ...(media.length > 0 ? { media } : {}),
    ...(post.card ? { card: post.card } : {}),
    ...(post.metrics ? { metrics: post.metrics } : {}),
    capturedAt: now.toISOString(),
  };
}

async function lookup(ctx: AppContext, id: string): Promise<{ post: XPost | undefined; authoritative: boolean }> {
  try {
    const seen = await ctx.xFeed.post(id);
    if (seen) return { post: seen, authoritative: true };
  } catch (err) {
    if (!(err instanceof XFeedUnavailable)) throw err;
  }
  if (!ctx.xEnrich.enabled) return { post: undefined, authoritative: false };
  try {
    return { post: await ctx.xEnrich.post(id), authoritative: true };
  } catch (err) {
    if (err instanceof XEnrichUnavailable) return { post: undefined, authoritative: false };
    throw err;
  }
}

/**
 * Re-reads the market's tweet from the X feed relay or twitterapi.io and returns the server's copy. A post X says
 * does not exist is rejected; a post by another account than the snapshot claims is rejected. When neither source
 * can answer (relay down, enrichment off or out of budget) creation is refused: a client snapshot alone would let
 * anyone publish a market, with a share card, quoting words a real account never posted.
 */
export async function verifySource(
  ctx: AppContext,
  source: TweetSnapshot,
  now: Date,
): Promise<{ snapshot: TweetSnapshot; verified: boolean }> {
  const { post, authoritative } = await lookup(ctx, source.id);
  if (!post) {
    if (authoritative)
      throw new HttpError(404, 'tweet_not_found', 'X has no such public post (deleted, protected or unknown)');
    throw new HttpError(503, 'x_feed_unavailable', 'This post cannot be checked on X right now, try again shortly');
  }
  if (post.kind === 'repost') throw new HttpError(422, 'invalid_tweet_url', 'Use the original post, not a repost');
  if (post.author.handle.toLowerCase() !== source.author.handle.toLowerCase())
    throw new HttpError(422, 'tweet_mismatch', `This post is by @${post.author.handle}, not @${source.author.handle}`);
  return { snapshot: snapshotOf(post, source, now), verified: true };
}
