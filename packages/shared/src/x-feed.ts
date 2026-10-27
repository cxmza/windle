import { z } from './zod.ts';

/** Where a post came from. Several sources may race; the first copy of a post id wins, later copies enrich it. */
export const XFeedSource = z.enum(['gmgn', 'twitterapi']);
export type XFeedSource = z.infer<typeof XFeedSource>;

export const XPostKind = z.enum(['tweet', 'reply', 'quote', 'repost']);
export type XPostKind = z.infer<typeof XPostKind>;

export const XAuthorTag = z.enum(['kol', 'founder', 'featured', 'media']);
export type XAuthorTag = z.infer<typeof XAuthorTag>;

/** X's check marks: blue (subscriber), gold (business), grey (government/multilateral). */
export const XVerified = z.enum(['none', 'blue', 'business', 'government']);
export type XVerified = z.infer<typeof XVerified>;

/** An organisation badge shown next to the name (e.g. an employee of @solana). */
export const XAffiliate = z.object({
  name: z.string(),
  handle: z.string().nullable(),
  badgeUrl: z.string().url().nullable(),
});
export type XAffiliate = z.infer<typeof XAffiliate>;

export const XAuthor = z.object({
  id: z.string().nullable(),
  handle: z.string(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  followers: z.number().int().nonnegative().nullable(),
  tags: z.array(XAuthorTag),
  /** Optional rich fields: only enriched posts (source `twitterapi`) carry them. */
  verified: XVerified.optional(),
  affiliate: XAffiliate.nullable().optional(),
  automated: z.boolean().optional(),
  parody: z.boolean().optional(),
});
export type XAuthor = z.infer<typeof XAuthor>;

/** `url` of a video or gif is the media file itself, not an image; `posterUrl` is its still frame when known. */
export const XMediaVariant = z.object({
  url: z.string().url(),
  contentType: z.string(),
  bitrate: z.number().int().nonnegative().nullable(),
});
export type XMediaVariant = z.infer<typeof XMediaVariant>;

export const XMedia = z.object({
  type: z.enum(['image', 'video', 'gif']),
  url: z.string().url(),
  posterUrl: z.string().url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  altText: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  /** Playable files for video/gif, best first (mp4 by bitrate). */
  variants: z.array(XMediaVariant).optional(),
});
export type XMedia = z.infer<typeof XMedia>;

export const XMetrics = z.object({
  replies: z.number().int().nonnegative(),
  reposts: z.number().int().nonnegative(),
  quotes: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  bookmarks: z.number().int().nonnegative().nullable(),
  views: z.number().int().nonnegative().nullable(),
});
export type XMetrics = z.infer<typeof XMetrics>;

/** Link preview. `url` is the expanded target (never t.co). */
export const XCard = z.object({
  kind: z.enum(['summary', 'summary_large_image', 'player', 'app', 'unknown']),
  url: z.string().url(),
  domain: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
});
export type XCard = z.infer<typeof XCard>;

export const XPoll = z.object({
  options: z
    .array(z.object({ label: z.string(), votes: z.number().int().nonnegative() }))
    .min(2)
    .max(4),
  totalVotes: z.number().int().nonnegative(),
  endsAt: z.iso.datetime().nullable(),
  closed: z.boolean(),
});
export type XPoll = z.infer<typeof XPoll>;

export const XArticle = z.object({
  title: z.string(),
  previewText: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
  url: z.string().url(),
});
export type XArticle = z.infer<typeof XArticle>;

export const XCommunityNote = z.object({ text: z.string(), url: z.string().url().nullable() });
export type XCommunityNote = z.infer<typeof XCommunityNote>;

/** t.co links in `text` with their real targets, so the UI can show and link the expanded URL. */
export const XUrlEntity = z.object({ url: z.string(), expandedUrl: z.string().url(), displayUrl: z.string() });
export type XUrlEntity = z.infer<typeof XUrlEntity>;

/**
 * The quoted post of a quote, or the original of a repost. The rich fields are optional like on XPost: only
 * enriched posts carry them. For a repost the original's link card, poll and article are here, not on the repost.
 */
export const XQuoted = z.object({
  id: z.string().nullable(),
  author: XAuthor.pick({ handle: true, name: true, avatarUrl: true }).extend({ verified: XVerified.optional() }),
  text: z.string(),
  media: z.array(XMedia),
  createdAt: z.iso.datetime().nullable().optional(),
  urls: z.array(XUrlEntity).optional(),
  card: XCard.nullable().optional(),
  poll: XPoll.nullable().optional(),
  article: XArticle.nullable().optional(),
});
export type XQuoted = z.infer<typeof XQuoted>;

/** A tweet id (snowflake), as in `https://x.com/<handle>/status/<id>`. */
export const XPostId = z.string().regex(/^\d{1,20}$/);

/**
 * Crypto signals the relay found in a post's text or in its quoted/reposted original: a `$CASHTAG`, a Solana or
 * EVM contract address, a link to pump.fun/dexscreener/solscan/etherscan/birdeye/jup.ag-like sites, a crypto
 * keyword. Newer relays may add values; treat unknown ones as opaque.
 */
export const X_SIGNALS = ['cashtag', 'ca_sol', 'ca_evm', 'link', 'keyword'] as const;
export type XSignal = (typeof X_SIGNALS)[number];

/**
 * One post of the live X feed as the api serves it.
 * `createdAt` is derived from the snowflake id (ms precision); `receivedAt` is when the relay first saw it.
 */
export const XPost = z.object({
  id: XPostId,
  kind: XPostKind,
  createdAt: z.iso.datetime(),
  receivedAt: z.iso.datetime(),
  url: z.string().url(),
  author: XAuthor,
  text: z.string(),
  media: z.array(XMedia),
  quoted: XQuoted.nullable(),
  inReplyTo: z.object({ id: z.string().nullable(), handle: z.string() }).nullable(),
  source: XFeedSource,
  /** See X_SIGNALS. Absent when the post has none (and from relays older than the field). */
  signals: z.array(z.string().max(32)).max(16).optional(),
  /** Rich X features below are optional: live gmgn posts lack them; enriched posts (source `twitterapi`) carry what X has. */
  metrics: XMetrics.nullable().optional(),
  card: XCard.nullable().optional(),
  poll: XPoll.nullable().optional(),
  article: XArticle.nullable().optional(),
  communityNote: XCommunityNote.nullable().optional(),
  urls: z.array(XUrlEntity).optional(),
  lang: z.string().nullable().optional(),
  possiblySensitive: z.boolean().optional(),
  edited: z.boolean().optional(),
  conversationId: z.string().nullable().optional(),
  /** The author replied to themselves: this post is part of a thread. */
  thread: z.boolean().optional(),
  /** When the full data was fetched from X (enriched posts only). */
  enrichedAt: z.iso.datetime().nullable().optional(),
});
export type XPost = z.infer<typeof XPost>;

export const XRecentResponse = z.object({ posts: z.array(XPost) });
export type XRecentResponse = z.infer<typeof XRecentResponse>;

/**
 * Server-Sent Events of GET /v1/x/stream:
 * - `snapshot` once on connect: XRecentResponse (newest first);
 * - `post`: XPost;
 * - `delete`: XDeleted;
 * - a `: ping` comment every 15 s keeps proxies from closing the stream.
 */
export const XDeleted = z.object({ id: z.string() });
export type XDeleted = z.infer<typeof XDeleted>;

export const X_STREAM_EVENTS = ['snapshot', 'post', 'delete'] as const;
export type XStreamEvent = (typeof X_STREAM_EVENTS)[number];
