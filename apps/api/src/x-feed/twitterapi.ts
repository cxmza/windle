import { z } from 'zod';

/**
 * twitterapi.io payloads as observed live (2026-10), parsed permissively: every leaf falls back to null on an
 * unexpected type, so upstream drift degrades a field instead of failing the whole lookup.
 */
const Str = z.string().nullish().catch(null);
const Num = z.number().nullish().catch(null);
const Bool = z.boolean().nullish().catch(null);

const RawUrl = z.object({ url: Str, expanded_url: Str, display_url: Str });

const RawVariant = z.object({ bitrate: Num, content_type: Str, url: Str });

const RawMedia = z.object({
  type: Str,
  url: Str,
  media_url_https: Str,
  ext_alt_text: Str,
  original_info: z.object({ width: Num, height: Num }).nullish().catch(null),
  video_info: z
    .object({ duration_millis: Num, variants: z.array(RawVariant).nullish().catch(null) })
    .nullish()
    .catch(null),
  sensitive_media_warning: z.unknown().optional(),
});

const RawBinding = z.object({
  key: z.string(),
  value: z
    .object({
      string_value: Str,
      boolean_value: Bool,
      image_value: z.object({ url: Str, width: Num, height: Num, alt: Str }).nullish().catch(null),
    })
    .nullish()
    .catch(null),
});

const RawCardBody = z.object({ name: Str, url: Str, binding_values: z.array(RawBinding).nullish().catch(null) });
/** `/twitter/tweets` nests the card under `legacy`; search results have it flat. */
const RawCard = RawCardBody.extend({ legacy: RawCardBody.nullish().catch(null) });
export type RawCard = z.infer<typeof RawCard>;

const RawAuthor = z.object({
  userName: z.string(),
  id: Str,
  name: Str,
  isVerified: Bool,
  isBlueVerified: Bool,
  verifiedType: Str,
  profilePicture: Str,
  followers: Num,
  isAutomated: Bool,
  affiliatesHighlightedLabel: z
    .object({
      label: z
        .object({
          description: Str,
          badge: z.object({ url: Str }).nullish().catch(null),
          url: z.object({ url: Str }).nullish().catch(null),
        })
        .nullish()
        .catch(null),
    })
    .nullish()
    .catch(null),
});
export type RawAuthor = z.infer<typeof RawAuthor>;

/** The light article object search results carry on the tweet; `/twitter/article` has the same three fields. */
const RawArticle = z.object({ title: Str, preview_text: Str, cover_media_img_url: Str });
export type RawArticle = z.infer<typeof RawArticle>;

const RawTweetBase = z.object({
  id: z.string(),
  text: z.string().nullish().catch(null),
  createdAt: Str,
  lang: Str,
  replyCount: Num,
  retweetCount: Num,
  quoteCount: Num,
  likeCount: Num,
  bookmarkCount: Num,
  viewCount: Num,
  isReply: Bool,
  inReplyToId: Str,
  inReplyToUserId: Str,
  inReplyToUsername: Str,
  conversationId: Str,
  displayTextRange: z.array(z.number()).nullish().catch(null),
  author: RawAuthor,
  entities: z
    .object({ urls: z.array(RawUrl).nullish().catch(null) })
    .nullish()
    .catch(null),
  extendedEntities: z
    .object({ media: z.array(RawMedia).nullish().catch(null) })
    .nullish()
    .catch(null),
  card: RawCard.nullish().catch(null),
  article: RawArticle.nullish().catch(null),
});
export type RawTweetBase = z.infer<typeof RawTweetBase>;

const RawTweet = RawTweetBase.extend({
  quoted_tweet: RawTweetBase.nullish().catch(null),
  retweeted_tweet: RawTweetBase.extend({ quoted_tweet: RawTweetBase.nullish().catch(null) })
    .nullish()
    .catch(null),
});
export type RawTweet = z.infer<typeof RawTweet>;

const TweetsResponse = z.object({
  status: Str,
  msg: Str,
  message: Str,
  tweets: z.array(z.unknown()).nullish(),
});

const ArticleResponse = z.object({ status: Str, msg: Str, message: Str, article: z.unknown().nullish() });

/** twitterapi.io could not answer (network, auth, quota, 5xx, garbage). The message never contains the key. */
export class TwitterApiUnavailable extends Error {}

export interface TwitterApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class TwitterApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: TwitterApiClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? 'https://api.twitterapi.io';
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  /** One tweet by id, or null when X has none (deleted, protected, suspended author, never existed). */
  async tweet(id: string): Promise<RawTweet | null> {
    const body = TweetsResponse.safeParse(await this.get('/twitter/tweets', { tweet_ids: id }));
    if (!body.success || body.data.status !== 'success' || !body.data.tweets) {
      throw new TwitterApiUnavailable(`unexpected tweets payload: ${this.statusOf(body.data)}`);
    }
    const raw = body.data.tweets.find((t) => typeof t === 'object' && t !== null && 'id' in t && t.id === id);
    if (raw === undefined) return null;
    const parsed = RawTweet.safeParse(raw);
    if (!parsed.success) throw new TwitterApiUnavailable('tweet payload does not match the expected shape');
    return parsed.data;
  }

  /** Title, preview and cover of an X article posted as this tweet (~100 credits), or null. */
  async article(tweetId: string): Promise<RawArticle | null> {
    const body = ArticleResponse.safeParse(await this.get('/twitter/article', { tweet_id: tweetId }));
    if (!body.success || body.data.status !== 'success') {
      throw new TwitterApiUnavailable(`unexpected article payload: ${this.statusOf(body.data)}`);
    }
    const parsed = RawArticle.safeParse(body.data.article);
    return parsed.success ? parsed.data : null;
  }

  private statusOf(data: { status?: string | null; msg?: string | null; message?: string | null } | undefined) {
    return this.redact(`${data?.status ?? 'no status'} ${data?.msg ?? data?.message ?? ''}`.trim().slice(0, 200));
  }

  private async get(path: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { 'X-API-Key': this.apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new TwitterApiUnavailable(`twitterapi.io unreachable: ${this.redact(errorMessage(err))}`);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new TwitterApiUnavailable(`twitterapi.io answered ${res.status}`);
    }
    try {
      return await res.json();
    } catch {
      throw new TwitterApiUnavailable('twitterapi.io sent invalid JSON');
    }
  }

  private redact(message: string): string {
    return this.apiKey ? message.split(this.apiKey).join('[redacted]') : message;
  }
}

const TCO = /^https:\/\/t\.co\/[A-Za-z0-9]{1,32}$/;

/** Follows one t.co redirect (no body, no further hops). Null when it is not a t.co link or does not resolve. */
export async function resolveTco(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 2_000) {
  if (!TCO.test(url)) return null;
  try {
    const res = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel().catch(() => undefined);
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location || !URL.canParse(location)) return null;
    const target = new URL(location);
    if (!['http:', 'https:'].includes(target.protocol) || target.hostname === 't.co') return null;
    return target.href;
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.cause instanceof Error ? `${err.message}: ${err.cause.message}` : err.message;
  return String(err);
}
