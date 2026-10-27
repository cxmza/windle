import type {
  XArticle,
  XAuthor,
  XCard,
  XMedia,
  XMediaVariant,
  XMetrics,
  XPoll,
  XPost,
  XQuoted,
  XUrlEntity,
  XVerified,
} from '@windle/shared';
import type { RawArticle, RawAuthor, RawCard, RawTweet, RawTweetBase } from './twitterapi.ts';

/** Hosts the app may hotlink (avatars, media, card images). Everything else is dropped. */
const ALLOWED_HOSTS = new Set(['pbs.twimg.com', 'video.twimg.com', 'abs.twimg.com', 'ton.twimg.com']);
/** X now hands out video variants on video-s.twimg.com; video.twimg.com serves the same paths (checked 2026-10). */
const HOST_ALIASES: Record<string, string> = { 'video-s.twimg.com': 'video.twimg.com' };
/** Default playback file: the best mp4 at or under this bitrate (720p is ~2.2 Mbps); `variants` has all of them. */
const DEFAULT_MAX_BITRATE = 2_500_000;
const SNOWFLAKE_MIN = 300_000_000_000_000n;
const TWITTER_EPOCH_MS = 1_288_834_974_657n;
const PROFILE_IMAGE_SIZE = /_(?:normal|bigger|mini|x96|200x200|400x400)(\.[A-Za-z0-9]+)?$/;
const ARTICLE_URL = /^https:\/\/(?:x|twitter)\.com\/i\/article\/\d+/;
const PROFILE_URL = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,50})\/?$/;
const TRAILING_TCO = /\s*(https:\/\/t\.co\/[A-Za-z0-9]+)\s*$/;
const LEADING_MENTIONS = /^(?:\s*@[A-Za-z0-9_]{1,50})+\s*$/;
const CARD_IMAGE_KEYS = [
  'summary_photo_image_large',
  'photo_image_full_size_large',
  'thumbnail_image_large',
  'player_image_large',
  'summary_photo_image',
  'photo_image_full_size',
  'thumbnail_image',
  'player_image',
  'summary_photo_image_original',
  'thumbnail_image_original',
  'player_image_original',
];

export interface MapContext {
  now: Date;
  /** Expands a t.co link that the tweet's own url entities do not cover (card links). */
  resolveTco: (url: string) => Promise<string | null>;
  /** Articles fetched separately (by tweet id), for tweets whose payload has no `article` object. */
  articles?: ReadonlyMap<string, RawArticle>;
}

/** Maps a twitterapi.io tweet to the shared XPost (source `twitterapi`). The caller validates the result. */
export async function mapTweet(raw: RawTweet, ctx: MapContext): Promise<XPost> {
  const now = ctx.now.toISOString();
  const author = mapAuthor(raw.author);
  const original = raw.retweeted_tweet ?? null;
  const kind: XPost['kind'] = original ? 'repost' : raw.isReply ? 'reply' : raw.quoted_tweet ? 'quote' : 'tweet';
  const own = original ? null : raw;
  const quotedRaw = original ?? raw.quoted_tweet ?? null;
  const media = own ? mapMedia(own) : [];

  const post: XPost = {
    id: raw.id,
    kind,
    createdAt: createdAt(raw.id, raw.createdAt) ?? now,
    receivedAt: now,
    url: `https://x.com/${author.handle}/status/${raw.id}`,
    author,
    text: own ? cleanText(own) : '',
    media,
    quoted: quotedRaw ? await mapQuoted(quotedRaw, ctx) : null,
    inReplyTo:
      own?.isReply && own.inReplyToUsername ? { id: own.inReplyToId ?? null, handle: own.inReplyToUsername } : null,
    source: 'twitterapi',
    metrics: mapMetrics(original ?? raw),
    card: null,
    poll: null,
    article: null,
    urls: own ? urlEntities(own) : [],
    lang: (original ?? raw).lang || null,
    conversationId: (original ?? raw).conversationId || null,
    thread: Boolean(own?.isReply && own.inReplyToUserId && own.inReplyToUserId === raw.author.id),
    enrichedAt: now,
  };
  if (own) {
    const rich = await mapRich(own, ctx);
    post.card = rich.card;
    post.poll = rich.poll;
    post.article = rich.article;
  }
  if (own && sensitive(own)) post.possiblySensitive = true;
  return post;
}

async function mapQuoted(raw: RawTweetBase, ctx: MapContext): Promise<XQuoted> {
  const author = mapAuthor(raw.author);
  const rich = await mapRich(raw, ctx);
  return {
    id: raw.id,
    author: { handle: author.handle, name: author.name, avatarUrl: author.avatarUrl, verified: author.verified },
    text: cleanText(raw),
    media: mapMedia(raw),
    createdAt: createdAt(raw.id, raw.createdAt),
    urls: urlEntities(raw),
    card: rich.card,
    poll: rich.poll,
    article: rich.article,
  };
}

// --- author ----------------------------------------------------------------------------------------------------

function mapAuthor(a: RawAuthor): XAuthor {
  const avatar = safeMediaUrl(a.profilePicture);
  const author: XAuthor = {
    id: a.id || null,
    handle: a.userName,
    name: a.name?.trim() || a.userName,
    avatarUrl: avatar ? smallAvatar(avatar) : null,
    followers: nonNegativeInt(a.followers),
    tags: [],
    verified: verified(a),
    affiliate: affiliate(a),
  };
  if (typeof a.isAutomated === 'boolean') author.automated = a.isAutomated;
  return author;
}

function verified(a: RawAuthor): XVerified {
  const type = a.verifiedType?.toLowerCase();
  if (type === 'business') return 'business';
  if (type === 'government') return 'government';
  return a.isBlueVerified || a.isVerified ? 'blue' : 'none';
}

function affiliate(a: RawAuthor): XAuthor['affiliate'] {
  const label = a.affiliatesHighlightedLabel?.label;
  const name = label?.description?.trim();
  if (!label || !name) return null;
  const profile = label.url?.url?.match(PROFILE_URL);
  return { name, handle: profile?.[1] ?? null, badgeUrl: safeMediaUrl(label.badge?.url) };
}

/** pbs.twimg.com profile images in the 73x73 `_bigger` size, like the relay (the app draws avatars small). */
function smallAvatar(url: string): string {
  if (!url.startsWith('https://pbs.twimg.com/profile_images/') || /[?#]/.test(url)) return url;
  return url.replace(PROFILE_IMAGE_SIZE, '_bigger$1');
}

// --- text, urls, metrics ---------------------------------------------------------------------------------------

/**
 * The visible text: leading reply mentions cut where X cuts them (`displayTextRange`), trailing t.co links of the
 * tweet's own media and of the quoted post removed (X renders those as media / a quote box), entities decoded.
 * The range is not used for the end: long posts carry their full text while the range covers the first 280.
 */
function cleanText(t: RawTweetBase): string {
  let text = t.text ?? '';
  const start = t.displayTextRange?.[0] ?? 0;
  if (t.isReply && start > 0 && start <= text.length && LEADING_MENTIONS.test(text.slice(0, start))) {
    text = text.slice(start);
  }
  const mediaLinks = new Set((t.extendedEntities?.media ?? []).map((m) => m.url).filter((u) => !!u));
  const known = new Map((t.entities?.urls ?? []).map((u) => [u.url, u.expanded_url]));
  const quotedId = 'quoted_tweet' in t && isObject(t.quoted_tweet) ? String(t.quoted_tweet.id) : null;
  for (;;) {
    const m = text.match(TRAILING_TCO);
    const link = m?.[1];
    if (!m || !link) break;
    const expanded = known.get(link);
    const isMedia = mediaLinks.has(link);
    const isQuoteLink =
      quotedId !== null && (expanded === undefined || (expanded ?? '').includes(`/status/${quotedId}`));
    if (!isMedia && !isQuoteLink) break;
    text = text.slice(0, m.index);
  }
  return decodeEntities(text).trim();
}

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>' })[name] ?? _);
}

function urlEntities(t: RawTweetBase): XUrlEntity[] {
  const out: XUrlEntity[] = [];
  for (const u of t.entities?.urls ?? []) {
    if (!u.url || !u.expanded_url || !URL.canParse(u.expanded_url)) continue;
    out.push({ url: u.url, expandedUrl: u.expanded_url, displayUrl: u.display_url || u.expanded_url });
  }
  return out;
}

function mapMetrics(t: RawTweetBase): XMetrics | null {
  if (t.likeCount == null && t.retweetCount == null && t.replyCount == null && t.quoteCount == null) return null;
  return {
    replies: nonNegativeInt(t.replyCount) ?? 0,
    reposts: nonNegativeInt(t.retweetCount) ?? 0,
    quotes: nonNegativeInt(t.quoteCount) ?? 0,
    likes: nonNegativeInt(t.likeCount) ?? 0,
    bookmarks: nonNegativeInt(t.bookmarkCount),
    views: nonNegativeInt(t.viewCount),
  };
}

function sensitive(t: RawTweetBase): boolean {
  return (t.extendedEntities?.media ?? []).some((m) => m.sensitive_media_warning != null);
}

// --- media -----------------------------------------------------------------------------------------------------

function mapMedia(t: RawTweetBase): XMedia[] {
  const out: XMedia[] = [];
  for (const m of t.extendedEntities?.media ?? []) {
    const still = safeMediaUrl(m.media_url_https);
    const size = {
      width: positiveInt(m.original_info?.width),
      height: positiveInt(m.original_info?.height),
      altText: m.ext_alt_text?.trim() || null,
    };
    if (m.type === 'photo') {
      if (still) out.push({ type: 'image', url: still, ...size });
      continue;
    }
    if (m.type !== 'video' && m.type !== 'animated_gif') continue;
    const variants = playable(m.video_info?.variants ?? []);
    const mp4 = variants.filter((v) => v.contentType === 'video/mp4');
    const pick = mp4.find((v) => (v.bitrate ?? 0) <= DEFAULT_MAX_BITRATE) ?? mp4.at(-1);
    if (!pick) continue;
    out.push({
      type: m.type === 'video' ? 'video' : 'gif',
      url: pick.url,
      posterUrl: still,
      ...size,
      durationMs: nonNegativeInt(m.video_info?.duration_millis),
      variants,
    });
  }
  return out;
}

/** mp4 files by bitrate (best first), then streaming playlists (HLS, for Safari). Unknown hosts are dropped. */
function playable(raw: { url?: string | null; content_type?: string | null; bitrate?: number | null }[]) {
  const variants: XMediaVariant[] = [];
  for (const v of raw) {
    const url = safeMediaUrl(v.url);
    if (!url || !v.content_type) continue;
    variants.push({ url, contentType: v.content_type, bitrate: nonNegativeInt(v.bitrate) });
  }
  const isMp4 = (v: XMediaVariant) => v.contentType === 'video/mp4';
  return variants.sort((a, b) => (isMp4(a) !== isMp4(b) ? (isMp4(a) ? -1 : 1) : (b.bitrate ?? -1) - (a.bitrate ?? -1)));
}

// --- card, poll, article ---------------------------------------------------------------------------------------

async function mapRich(
  t: RawTweetBase,
  ctx: MapContext,
): Promise<{ card: XCard | null; poll: XPoll | null; article: XArticle | null }> {
  const body = cardBody(t.card);
  const name = body?.name?.split(':').at(-1) ?? '';
  const poll = body && /^poll[2-4]choice/.test(name) ? mapPoll(body, ctx.now) : null;
  const card = body && !poll ? await mapCard(t, body, name, ctx) : null;
  return { card, poll, article: mapArticle(t, ctx) };
}

type CardBody = NonNullable<RawCard['legacy']>;

function cardBody(card: RawCard | null | undefined): CardBody | null {
  if (!card) return null;
  const body = card.legacy ?? card;
  return body.name ? body : null;
}

function bindings(body: CardBody) {
  return new Map((body.binding_values ?? []).map((b) => [b.key, b.value ?? null]));
}

function mapPoll(body: CardBody, now: Date): XPoll | null {
  const values = bindings(body);
  const options: XPoll['options'] = [];
  for (let i = 1; i <= 4; i++) {
    const label = values.get(`choice${i}_label`)?.string_value;
    if (label == null) break;
    const votes = Number.parseInt(values.get(`choice${i}_count`)?.string_value ?? '0', 10);
    options.push({ label, votes: Number.isFinite(votes) && votes > 0 ? votes : 0 });
  }
  if (options.length < 2) return null;
  const end = values.get('end_datetime_utc')?.string_value;
  const endsAt = end && !Number.isNaN(Date.parse(end)) ? new Date(end).toISOString() : null;
  const final = values.get('counts_are_final')?.boolean_value === true;
  return {
    options,
    totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
    endsAt,
    closed: final || (endsAt !== null && Date.parse(endsAt) <= now.getTime()),
  };
}

async function mapCard(t: RawTweetBase, body: CardBody, name: string, ctx: MapContext): Promise<XCard | null> {
  const values = bindings(body);
  const str = (key: string) => values.get(key)?.string_value?.trim() || null;
  const link = body.url ?? str('card_url');
  const url = await expandCardUrl(t, link, str('card_url'), str('vanity_url') ?? str('domain'), ctx);
  if (!url) return null;
  let imageUrl: string | null = null;
  for (const key of CARD_IMAGE_KEYS) {
    imageUrl = safeMediaUrl(values.get(key)?.image_value?.url);
    if (imageUrl) break;
  }
  const title = str('title');
  if (!title && !imageUrl) return null;
  return {
    kind: cardKind(name),
    url,
    domain: str('vanity_url') ?? str('domain') ?? new URL(url).hostname,
    title: title ?? '',
    description: str('description'),
    imageUrl,
  };
}

function cardKind(name: string): XCard['kind'] {
  if (name === 'summary' || name === 'summary_large_image' || name === 'player') return name;
  return /app/.test(name) ? 'app' : 'unknown';
}

/** The card's real target: the tweet's own url entities, else one t.co hop, else a non-t.co card_url, else the site. */
async function expandCardUrl(
  t: RawTweetBase,
  link: string | null | undefined,
  cardUrl: string | null,
  domain: string | null,
  ctx: MapContext,
): Promise<string | null> {
  if (link) {
    const known = (t.entities?.urls ?? []).find((u) => u.url === link)?.expanded_url;
    if (known && URL.canParse(known)) return known;
    if (link.startsWith('https://t.co/')) {
      const resolved = await ctx.resolveTco(link);
      if (resolved) return resolved;
    } else if (isHttpUrl(link)) {
      return link;
    }
  }
  if (cardUrl && isHttpUrl(cardUrl) && !cardUrl.startsWith('https://t.co/') && new URL(cardUrl).pathname !== '/') {
    return cardUrl;
  }
  const site = domain && URL.canParse(`https://${domain}`) ? `https://${new URL(`https://${domain}`).hostname}/` : null;
  return site;
}

function mapArticle(t: RawTweetBase, ctx: MapContext): XArticle | null {
  const raw = t.article ?? ctx.articles?.get(t.id);
  const title = raw?.title?.trim();
  if (!raw || !title) return null;
  return {
    title,
    previewText: raw.preview_text?.trim() || null,
    coverUrl: safeMediaUrl(raw.cover_media_img_url),
    url: articleUrl(t) ?? `https://x.com/${t.author.userName}/status/${t.id}`,
  };
}

/** The x.com/i/article/<id> link in a tweet, if any: such a tweet is an X article. */
export function articleUrl(t: RawTweetBase): string | null {
  for (const u of t.entities?.urls ?? []) {
    if (u.expanded_url && ARTICLE_URL.test(u.expanded_url)) return u.expanded_url;
  }
  return null;
}

// --- helpers ---------------------------------------------------------------------------------------------------

/** https URL on an allowed X media host (aliases rewritten), else null. */
export function safeMediaUrl(raw: string | null | undefined): string | null {
  if (!raw || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:') return null;
  url.hostname = HOST_ALIASES[url.hostname] ?? url.hostname;
  return ALLOWED_HOSTS.has(url.hostname) ? url.href : null;
}

function isHttpUrl(s: string): boolean {
  return URL.canParse(s) && ['http:', 'https:'].includes(new URL(s).protocol);
}

function isObject(v: unknown): v is { id: unknown } {
  return typeof v === 'object' && v !== null && 'id' in v;
}

/** Snowflake ids carry their creation time (ms); older ids fall back to X's `createdAt` string. */
function createdAt(id: string, fallback: string | null | undefined): string | null {
  const n = /^\d{1,20}$/.test(id) ? BigInt(id) : 0n;
  if (n >= SNOWFLAKE_MIN) return new Date(Number((n >> 22n) + TWITTER_EPOCH_MS)).toISOString();
  const parsed = fallback ? Date.parse(fallback) : Number.NaN;
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function nonNegativeInt(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function positiveInt(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
}
