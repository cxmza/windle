import { setTimeout as sleep } from 'node:timers/promises';
import { XDeleted, XPost } from '@windle/shared';
import type { FastifyBaseLogger } from 'fastify';
import { SseParser, sseFrame, ssePing, sseRetry } from './sse.ts';

/** One browser stream. The hub writes SSE text; `buffered` is what the client has not consumed yet. */
export interface XFeedClient {
  write(chunk: string): void;
  end(chunk?: string): void;
  destroy(): void;
  buffered(): number;
}

export class XFeedUnavailable extends Error {}

export interface XFeedHubOptions {
  relayUrl: string;
  log: FastifyBaseLogger;
  fetch?: typeof fetch;
  snapshotSize?: number;
  pingIntervalMs?: number;
  /** The relay pings every 15 s; this much silence means the upstream stream is dead. */
  upstreamIdleMs?: number;
  /** Keep the upstream stream this long after the last client left (tab reloads, relay blips). */
  lingerMs?: number;
  /** A client arriving while the upstream is down waits this long for it before getting a retry hint. */
  connectWaitMs?: number;
  recentTimeoutMs?: number;
  maxBufferedBytes?: number;
  /**
   * EventSource reconnect delay sent to browsers, picked uniformly in [min, max] to spread reconnects. While the
   * relay stays down it grows to about half the outage so far (jittered), up to retryMaxMs: a relay restart is
   * picked up within seconds, a long outage is not polled every second by every browser.
   */
  retryMs?: readonly [number, number];
  retryMaxMs?: number;
  /** Delay between relay reconnection attempts: min, doubling per attempt, capped at max (with ±20% jitter). */
  backoffMs?: readonly [number, number];
}

export interface XFeedStats {
  live: boolean;
  clients: number;
  upstreamSessions: number;
  invalidDropped: number;
  slowClientsDropped: number;
}

/**
 * One upstream SSE connection to the relay, fanned out to every browser stream. The upstream is opened lazily by
 * the first client and closed `lingerMs` after the last one leaves. Every relay payload is validated against the
 * shared zod schemas; invalid ones are dropped. When the upstream goes down, every client gets a `retry:` hint and
 * is closed, so each (re)connection starts with a fresh `snapshot` (the contract: one snapshot per connection).
 */
export class XFeedHub {
  private readonly relayUrl: string;
  private readonly log: FastifyBaseLogger;
  private readonly fetchImpl: typeof fetch;
  private readonly snapshotSize: number;
  private readonly pingIntervalMs: number;
  private readonly upstreamIdleMs: number;
  private readonly lingerMs: number;
  private readonly connectWaitMs: number;
  private readonly recentTimeoutMs: number;
  private readonly maxBufferedBytes: number;
  private readonly retryMs: readonly [number, number];
  private readonly retryMaxMs: number;
  private readonly backoffMs: readonly [number, number];

  private readonly clients = new Set<XFeedClient>();
  private readonly liveWaiters = new Set<(live: boolean) => void>();
  private readonly closing = new AbortController();
  private posts: XPost[] = [];
  private live = false;
  private running = false;
  private pending = 0;
  private session: AbortController | undefined;
  private pingTimer: NodeJS.Timeout | undefined;
  private lingerTimer: NodeJS.Timeout | undefined;
  private upstreamSessions = 0;
  /** When the relay stream was lost (or first failed); undefined while live. Scales the browser retry hint. */
  private downSince: number | undefined;
  private invalidDropped = 0;
  private slowClientsDropped = 0;

  constructor(opts: XFeedHubOptions) {
    this.relayUrl = opts.relayUrl;
    this.log = opts.log;
    this.fetchImpl = opts.fetch ?? fetch;
    this.snapshotSize = opts.snapshotSize ?? 50;
    this.pingIntervalMs = opts.pingIntervalMs ?? 15_000;
    this.upstreamIdleMs = opts.upstreamIdleMs ?? 45_000;
    this.lingerMs = opts.lingerMs ?? 60_000;
    this.connectWaitMs = opts.connectWaitMs ?? 3_000;
    this.recentTimeoutMs = opts.recentTimeoutMs ?? 2_500;
    this.maxBufferedBytes = opts.maxBufferedBytes ?? 256 * 1024;
    this.retryMs = opts.retryMs ?? [1_000, 2_000];
    this.retryMaxMs = opts.retryMaxMs ?? 10_000;
    this.backoffMs = opts.backoffMs ?? [500, 5_000];
  }

  stats(): XFeedStats {
    return {
      live: this.live,
      clients: this.clients.size,
      upstreamSessions: this.upstreamSessions,
      invalidDropped: this.invalidDropped,
      slowClientsDropped: this.slowClientsDropped,
    };
  }

  /** Newest-first posts straight from the relay ring (validated). Throws XFeedUnavailable when the relay is not. */
  async recent(limit: number): Promise<XPost[]> {
    const url = new URL('/recent', this.relayUrl);
    url.searchParams.set('limit', String(limit));
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.recentTimeoutMs),
      });
    } catch (err) {
      throw new XFeedUnavailable('relay unreachable', { cause: err });
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new XFeedUnavailable(`relay answered ${res.status}`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new XFeedUnavailable('relay sent invalid JSON', { cause: err });
    }
    const posts = this.validPosts(body);
    if (!posts) throw new XFeedUnavailable('relay payload has no posts array');
    return posts.slice(0, limit);
  }

  /**
   * One post the relay saw recently — in the feed, still held back, gated out of it or already evicted from its
   * ring — or undefined when the relay does not know the id. Throws XFeedUnavailable when the relay is down.
   */
  async post(id: string): Promise<XPost | undefined> {
    const url = new URL(`/post/${encodeURIComponent(id)}`, this.relayUrl);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.recentTimeoutMs),
      });
    } catch (err) {
      throw new XFeedUnavailable('relay unreachable', { cause: err });
    }
    // The relay's own 404 is JSON; a plain-text 404 is a relay without this route.
    if (res.status === 404 && res.headers.get('content-type')?.includes('application/json')) {
      await res.body?.cancel().catch(() => undefined);
      return undefined;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new XFeedUnavailable(`relay answered ${res.status}`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new XFeedUnavailable('relay sent invalid JSON', { cause: err });
    }
    const parsed = XPost.safeParse(body);
    if (!parsed.success || parsed.data.id !== id) {
      this.invalidDropped++;
      throw new XFeedUnavailable('relay sent an invalid post');
    }
    return parsed.data;
  }

  /**
   * Starts a browser stream: `retry` + `snapshot`, then live `post`/`delete` and pings. When the relay cannot be
   * reached within connectWaitMs the client gets only a retry hint and is ended. Returns whether it was attached.
   */
  async attach(client: XFeedClient): Promise<boolean> {
    if (this.closing.signal.aborted) {
      client.end(sseRetry(this.retryDelay()));
      return false;
    }
    this.cancelLinger();
    if (!this.live) {
      this.pending++;
      this.ensureUpstream();
      const live = await this.waitLive(this.connectWaitMs);
      this.pending--;
      if (!live) {
        client.end(sseRetry(this.retryDelay()));
        this.lingerIfIdle();
        return false;
      }
    }
    client.write(sseRetry(this.retryDelay()));
    client.write(sseFrame('snapshot', JSON.stringify({ posts: this.posts })));
    this.clients.add(client);
    this.ensurePing();
    return true;
  }

  detach(client: XFeedClient): void {
    if (!this.clients.delete(client)) return;
    if (this.clients.size === 0) {
      this.stopPing();
      this.lingerIfIdle();
    }
  }

  close(): void {
    if (this.closing.signal.aborted) return;
    this.closing.abort();
    this.session?.abort(new Error('api shutting down'));
    for (const client of this.clients) client.end(sseRetry(this.retryDelay()));
    this.clients.clear();
    this.stopPing();
    this.cancelLinger();
    for (const resolve of this.liveWaiters) resolve(false);
    this.liveWaiters.clear();
  }

  // --- upstream ---------------------------------------------------------------------------------------------

  private wanted(): boolean {
    return (
      !this.closing.signal.aborted && (this.clients.size > 0 || this.pending > 0 || this.lingerTimer !== undefined)
    );
  }

  private ensureUpstream(): void {
    if (this.running || this.closing.signal.aborted) return;
    this.running = true;
    void this.upstreamLoop().finally(() => {
      this.running = false;
    });
  }

  private async upstreamLoop(): Promise<void> {
    let attempt = 0;
    while (this.wanted()) {
      const started = Date.now();
      try {
        await this.readSession();
      } catch (err) {
        if (this.wanted()) {
          this.log.warn({ err: { message: errorMessage(err) }, attempt }, 'x feed relay stream failed');
        }
      }
      // A session closed for lack of clients is not an outage.
      if (this.wanted()) this.downSince ??= Date.now();
      else this.downSince = undefined;
      this.goDown();
      if (Date.now() - started > 60_000) attempt = 0;
      if (!this.wanted()) return;
      try {
        await sleep(this.backoff(attempt++), undefined, { signal: this.closing.signal });
      } catch {
        return;
      }
    }
  }

  private async readSession(): Promise<void> {
    const ac = new AbortController();
    this.session = ac;
    const idle = setTimeout(() => ac.abort(new Error('relay stream idle')), this.upstreamIdleMs);
    try {
      const res = await this.fetchImpl(new URL('/stream', this.relayUrl), {
        headers: { accept: 'text/event-stream' },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`relay answered ${res.status}`);
      }
      const parser = new SseParser();
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        idle.refresh();
        for (const message of parser.push(decoder.decode(chunk, { stream: true })))
          this.handle(message.event, message.data);
        if (!this.wanted()) {
          ac.abort(new Error('no subscribers'));
          return;
        }
      }
      throw new Error('relay stream ended');
    } catch (err) {
      throw ac.signal.aborted && ac.signal.reason instanceof Error ? ac.signal.reason : err;
    } finally {
      clearTimeout(idle);
      if (this.session === ac) this.session = undefined;
    }
  }

  private handle(event: string, data: string): void {
    if (event !== 'snapshot' && event !== 'post' && event !== 'delete') return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      this.invalidDropped++;
      return;
    }

    if (event === 'snapshot') {
      const posts = this.validPosts(json);
      if (!posts) {
        this.invalidDropped++;
        return;
      }
      this.posts = posts.slice(0, this.snapshotSize);
      if (!this.live) {
        this.live = true;
        this.upstreamSessions++;
        this.downSince = undefined;
        this.log.info({ posts: this.posts.length }, 'x feed relay stream live');
        for (const resolve of this.liveWaiters) resolve(true);
        this.liveWaiters.clear();
      }
      return;
    }
    if (!this.live) return;

    if (event === 'post') {
      const parsed = XPost.safeParse(json);
      if (!parsed.success) {
        this.invalidDropped++;
        return;
      }
      const post = parsed.data;
      const at = this.posts.findIndex((p) => p.id === post.id);
      if (at >= 0) this.posts[at] = post;
      else {
        this.posts.unshift(post);
        if (this.posts.length > this.snapshotSize) this.posts.length = this.snapshotSize;
      }
      this.broadcast(sseFrame('post', JSON.stringify(post)));
      return;
    }

    const parsed = XDeleted.safeParse(json);
    if (!parsed.success) {
      this.invalidDropped++;
      return;
    }
    this.posts = this.posts.filter((p) => p.id !== parsed.data.id);
    this.broadcast(sseFrame('delete', JSON.stringify(parsed.data)));
  }

  /** Upstream lost: every client gets a retry hint and is closed; the loop keeps reconnecting while lingering. */
  private goDown(): void {
    const hadClients = this.clients.size > 0;
    this.live = false;
    this.posts = [];
    for (const client of this.clients) client.end(sseRetry(this.retryDelay()));
    this.clients.clear();
    this.stopPing();
    if (hadClients) this.startLinger();
  }

  private validPosts(body: unknown): XPost[] | undefined {
    if (typeof body !== 'object' || body === null || !('posts' in body) || !Array.isArray(body.posts)) return undefined;
    const out: XPost[] = [];
    for (const raw of body.posts) {
      const parsed = XPost.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
      else this.invalidDropped++;
    }
    return out;
  }

  // --- clients ----------------------------------------------------------------------------------------------

  private broadcast(frame: string): void {
    for (const client of this.clients) this.send(client, frame);
  }

  private send(client: XFeedClient, frame: string): void {
    if (client.buffered() > this.maxBufferedBytes) {
      this.clients.delete(client);
      this.slowClientsDropped++;
      client.destroy();
      return;
    }
    client.write(frame);
  }

  private ensurePing(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      for (const client of this.clients) this.send(client, ssePing);
    }, this.pingIntervalMs);
    this.pingTimer.unref();
  }

  private stopPing(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private waitLive(ms: number): Promise<boolean> {
    if (this.live) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (live: boolean) => {
        clearTimeout(timer);
        this.liveWaiters.delete(done);
        resolve(live);
      };
      const timer = setTimeout(() => done(false), ms);
      this.liveWaiters.add(done);
    });
  }

  private lingerIfIdle(): void {
    if (this.clients.size === 0 && this.pending === 0 && this.running) this.startLinger();
  }

  private startLinger(): void {
    if (this.closing.signal.aborted) return;
    this.cancelLinger();
    this.lingerTimer = setTimeout(() => {
      this.lingerTimer = undefined;
      if (!this.wanted()) this.session?.abort(new Error('no subscribers'));
    }, this.lingerMs);
    this.lingerTimer.unref();
  }

  private cancelLinger(): void {
    clearTimeout(this.lingerTimer);
    this.lingerTimer = undefined;
  }

  private retryDelay(): number {
    const [min, max] = this.retryMs;
    const base = min + Math.random() * (max - min);
    const downFor = this.downSince === undefined ? 0 : Date.now() - this.downSince;
    const delay = Math.max(base, downFor * (0.4 + Math.random() * 0.2));
    return Math.round(Math.min(Math.max(this.retryMaxMs, min), delay));
  }

  private backoff(attempt: number): number {
    const [min, max] = this.backoffMs;
    const base = Math.min(max, min * 2 ** Math.min(attempt, 16));
    return Math.round(base * (0.8 + Math.random() * 0.4));
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.cause instanceof Error ? `${err.message}: ${err.cause.message}` : err.message;
  return String(err);
}
