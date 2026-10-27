import { XPost } from '@windle/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { Counter } from '../lib/metrics.ts';
import type { XFeedHub } from './hub.ts';
import { type RawArticle, type TwitterApiClient, TwitterApiUnavailable } from './twitterapi.ts';
import { articleUrl, mapTweet } from './twitterapi-map.ts';

/** Enrichment cannot answer now: disabled (no key), twitterapi.io down, budget spent, budget store down. */
export class XEnrichUnavailable extends Error {}

/** A cached lookup: the mapped post, or null when X had no such post. */
export interface XEnrichEntry {
  fetchedAt: number;
  post: XPost | null;
}

/** Ephemeral state of enrichment (Redis in production). */
export interface XEnrichStore {
  get(id: string): Promise<XEnrichEntry | null>;
  put(id: string, entry: XEnrichEntry, ttlSeconds: number): Promise<void>;
  /** Credits spent on the given UTC day. */
  spent(day: string): Promise<number>;
  /** Adds credits to the day's total; returns the new total. */
  spend(day: string, credits: number): Promise<number>;
}

const Entry = z.object({ fetchedAt: z.number(), post: XPost.nullable() });
const POST_PREFIX = 'wl:x:enrich:post:';
const CREDITS_PREFIX = 'wl:x:enrich:credits:';
const CREDITS_TTL_SECONDS = 2 * 24 * 3600;

export class RedisXEnrichStore implements XEnrichStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get(id: string) {
    const raw = await this.redis.get(POST_PREFIX + id);
    if (raw === null) return null;
    const parsed = Entry.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async put(id: string, entry: XEnrichEntry, ttlSeconds: number) {
    await this.redis.set(POST_PREFIX + id, JSON.stringify(entry), 'EX', ttlSeconds);
  }

  async spent(day: string) {
    return Number((await this.redis.get(CREDITS_PREFIX + day)) ?? 0);
  }

  async spend(day: string, credits: number) {
    const key = CREDITS_PREFIX + day;
    const replies = await this.redis.multi().incrby(key, credits).expire(key, CREDITS_TTL_SECONDS).exec();
    const [err, total] = replies?.[0] ?? [new Error('redis transaction aborted'), null];
    if (err) throw err;
    return Number(total);
  }
}

/** In-memory store with TTLs against an injectable clock. Tests and local dev only. */
export class MemoryXEnrichStore implements XEnrichStore {
  private readonly posts = new Map<string, { entry: XEnrichEntry; expiresAt: number }>();
  private readonly credits = new Map<string, number>();
  private readonly now: () => number;
  failing = false;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async get(id: string) {
    this.guard();
    const hit = this.posts.get(id);
    if (!hit || hit.expiresAt <= this.now()) return null;
    return structuredClone(hit.entry);
  }

  async put(id: string, entry: XEnrichEntry, ttlSeconds: number) {
    this.guard();
    this.posts.set(id, { entry: structuredClone(entry), expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async spent(day: string) {
    this.guard();
    return this.credits.get(day) ?? 0;
  }

  async spend(day: string, credits: number) {
    this.guard();
    const total = (this.credits.get(day) ?? 0) + credits;
    this.credits.set(day, total);
    return total;
  }

  private guard() {
    if (this.failing) throw new Error('memory enrich store: simulated outage');
  }
}

export interface XEnricherOptions {
  /** Undefined when TWITTERAPI_IO_KEY is not set: every enrich request is 503. */
  client: TwitterApiClient | undefined;
  store: XEnrichStore;
  hub: XFeedHub;
  log: FastifyBaseLogger;
  now: () => Date;
  dailyBudget: number;
  resolveTco: (url: string) => Promise<string | null>;
  /** Counters: `result` per request, credits per upstream call. */
  results: Counter;
  credits: Counter;
  /** Serve from cache without asking X again for this long (metrics freshness). */
  freshSeconds?: number;
  /** Keep content this long; past freshSeconds it is refetched, but served when X cannot be asked. */
  ttlSeconds?: number;
  tweetCredits?: number;
  articleCredits?: number;
}

export interface EnrichCallOptions {
  /** Runs right before a call to twitterapi.io (not on cache hits); throw to refuse it (rate limit). */
  beforeUpstream?: () => Promise<void>;
}

type Outcome = { post: XPost | null; result: 'hit' | 'miss' | 'not_found' | 'stale' };

/**
 * Full-fidelity posts from twitterapi.io for links users open (never the live feed): cache, then one tweet lookup
 * (~15 credits, plus ~100 for an X article), under a daily credit budget, merged with the relay's copy.
 */
export class XEnricher {
  private readonly client: TwitterApiClient | undefined;
  private readonly store: XEnrichStore;
  private readonly hub: XFeedHub;
  private readonly log: FastifyBaseLogger;
  private readonly now: () => Date;
  private readonly dailyBudget: number;
  private readonly resolveTco: (url: string) => Promise<string | null>;
  private readonly results: Counter;
  private readonly credits: Counter;
  private readonly freshMs: number;
  private readonly ttlSeconds: number;
  private readonly tweetCredits: number;
  private readonly articleCredits: number;
  private readonly inflight = new Map<string, Promise<Outcome>>();

  constructor(opts: XEnricherOptions) {
    this.client = opts.client;
    this.store = opts.store;
    this.hub = opts.hub;
    this.log = opts.log;
    this.now = opts.now;
    this.dailyBudget = opts.dailyBudget;
    this.resolveTco = opts.resolveTco;
    this.results = opts.results;
    this.credits = opts.credits;
    this.freshMs = (opts.freshSeconds ?? 300) * 1000;
    this.ttlSeconds = opts.ttlSeconds ?? 24 * 3600;
    this.tweetCredits = opts.tweetCredits ?? 15;
    this.articleCredits = opts.articleCredits ?? 100;
  }

  get enabled(): boolean {
    return this.client !== undefined;
  }

  /** The enriched post, or undefined when X has no such post. Throws XEnrichUnavailable (503) or the hook's error. */
  async post(id: string, opts: EnrichCallOptions = {}): Promise<XPost | undefined> {
    if (!this.client) {
      this.results.inc({ result: 'disabled' });
      throw new XEnrichUnavailable('enrichment is not configured');
    }
    const relay = this.hub.post(id).catch(() => undefined);
    const cached = await this.store.get(id).catch((err: unknown) => {
      this.log.warn({ err: { message: errorMessage(err) } }, 'x enrich cache read failed');
      return null;
    });

    let outcome: Outcome;
    if (cached && this.now().getTime() - cached.fetchedAt < this.freshMs) {
      outcome = { post: cached.post, result: 'hit' };
      this.results.inc({ result: 'hit' });
    } else {
      try {
        await opts.beforeUpstream?.();
      } catch (err) {
        this.results.inc({ result: 'rate_limited' });
        throw err;
      }
      outcome = await this.singleFlight(id, cached);
      this.results.inc({ result: outcome.result });
    }
    if (!outcome.post) return undefined;
    return merge(outcome.post, await relay);
  }

  private singleFlight(id: string, cached: XEnrichEntry | null): Promise<Outcome> {
    const running = this.inflight.get(id);
    if (running) return running;
    const task = this.fetch(id, cached).finally(() => this.inflight.delete(id));
    this.inflight.set(id, task);
    return task;
  }

  private async fetch(id: string, cached: XEnrichEntry | null): Promise<Outcome> {
    const client = this.client as TwitterApiClient;
    // X cannot be asked now: an older copy beats a 503.
    const stale = (result: 'error' | 'budget_exhausted', message: string, cause?: unknown): Outcome => {
      const err = cause === undefined ? undefined : { message: errorMessage(cause) };
      if (cached?.post) {
        this.log.warn({ id, reason: message, err }, 'x enrich served a stale copy');
        return { post: cached.post, result: 'stale' };
      }
      this.log.warn({ id, reason: message, err }, 'x enrich unavailable');
      this.results.inc({ result });
      throw new XEnrichUnavailable(message);
    };

    const day = this.now().toISOString().slice(0, 10);
    let spent: number;
    try {
      spent = await this.store.spent(day);
    } catch (err) {
      return stale('error', 'budget store unavailable', err);
    }
    if (spent + this.tweetCredits > this.dailyBudget) return stale('budget_exhausted', 'daily credit budget spent');

    let raw: Awaited<ReturnType<TwitterApiClient['tweet']>>;
    try {
      raw = await client.tweet(id);
    } catch (err) {
      if (!(err instanceof TwitterApiUnavailable)) throw err;
      return stale('error', 'twitterapi.io unavailable', err);
    }
    spent = await this.charge(day, this.tweetCredits, spent);

    if (!raw) {
      await this.put(id, { fetchedAt: this.now().getTime(), post: null }, this.freshMs / 1000);
      return { post: null, result: 'not_found' };
    }

    const articles = new Map<string, RawArticle>();
    const articleTweet = raw.retweeted_tweet ?? raw;
    if (!articleTweet.article && articleUrl(articleTweet) && spent + this.articleCredits <= this.dailyBudget) {
      try {
        const article = await client.article(articleTweet.id);
        if (article) articles.set(articleTweet.id, article);
        await this.charge(day, this.articleCredits, spent);
      } catch (err) {
        this.log.warn({ id, err: { message: errorMessage(err) } }, 'x enrich article lookup failed');
      }
    }

    const mapped = XPost.safeParse(await mapTweet(raw, { now: this.now(), resolveTco: this.resolveTco, articles }));
    if (!mapped.success) {
      this.log.error({ id, issues: mapped.error.issues.slice(0, 5) }, 'x enrich mapped an invalid post');
      return stale('error', 'mapped post failed the shared schema');
    }
    await this.put(id, { fetchedAt: this.now().getTime(), post: mapped.data }, this.ttlSeconds);
    return { post: mapped.data, result: 'miss' };
  }

  private async charge(day: string, credits: number, spent: number): Promise<number> {
    this.credits.inc({}, credits);
    try {
      return await this.store.spend(day, credits);
    } catch (err) {
      this.log.warn({ err: { message: errorMessage(err) } }, 'x enrich budget write failed');
      return spent + credits;
    }
  }

  private async put(id: string, entry: XEnrichEntry, ttlSeconds: number) {
    try {
      await this.store.put(id, entry, Math.max(1, Math.round(ttlSeconds)));
    } catch (err) {
      this.log.warn({ err: { message: errorMessage(err) } }, 'x enrich cache write failed');
    }
  }
}

/** Rich fields from X; the relay's own judgement (tags, signals) and first-seen time stay. */
function merge(post: XPost, relay: XPost | undefined): XPost {
  if (!relay) return post;
  const out: XPost = { ...post, receivedAt: relay.receivedAt, author: { ...post.author, tags: relay.author.tags } };
  if (relay.signals) out.signals = relay.signals;
  return out;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.cause instanceof Error ? `${err.message}: ${err.cause.message}` : err.message;
  return String(err);
}
