import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { type ApiError, XPost } from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { APP_ORIGIN, makeTestApp } from '../test/helpers.ts';
import { XFeedHub } from './hub.ts';
import { SseParser, sseFrame } from './sse.ts';

function post(id: string, text = `post ${id}`): XPost {
  return XPost.parse({
    id,
    kind: 'tweet',
    createdAt: '2026-09-23T10:47:45.268Z',
    receivedAt: '2026-09-23T10:47:46.000Z',
    url: `https://x.com/djcows/status/${id}`,
    author: {
      id: '217856128',
      handle: 'djcows',
      name: 'djcows',
      avatarUrl: 'https://pbs.twimg.com/profile_images/1/a_400x400.jpg',
      followers: 25879,
      tags: ['kol'],
    },
    text,
    media: [{ type: 'image', url: 'https://pbs.twimg.com/media/x.jpg' }],
    quoted: null,
    inReplyTo: null,
    source: 'gmgn',
  });
}
const INVALID = { id: 'not-a-snowflake', kind: 'tweet' };

/** Stands in for services/x-relay: GET /recent and GET /stream with scriptable content. */
class FakeRelay {
  server: Server;
  url = '';
  recent: unknown = { posts: [] };
  recentStatus = 200;
  /** GET /post/:id answers: a body (200), `null` (the relay's JSON 404) or a status for a plain-text error. */
  posts = new Map<string, unknown>();
  snapshot: unknown[] = [];
  streams = new Set<ServerResponse>();
  streamConnections = 0;

  constructor() {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url?.startsWith('/recent')) {
        res.writeHead(this.recentStatus, { 'content-type': 'application/json' });
        res.end(typeof this.recent === 'string' ? this.recent : JSON.stringify(this.recent));
        return;
      }
      if (req.url?.startsWith('/post/')) {
        const found = this.posts.get(req.url.slice('/post/'.length));
        if (typeof found === 'number') {
          res.writeHead(found, { 'content-type': 'text/plain' }).end('404 page not found');
        } else if (found === undefined || found === null) {
          res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"post not seen recently"}');
        } else {
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(found));
        }
        return;
      }
      if (req.url === '/stream') {
        this.streamConnections++;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('retry: 3000\n\n');
        res.write(sseFrame('snapshot', JSON.stringify({ posts: this.snapshot })));
        this.streams.add(res);
        res.on('close', () => this.streams.delete(res));
        return;
      }
      res.writeHead(404).end();
    });
  }

  async start() {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  emit(event: string, data: unknown) {
    for (const res of this.streams) res.write(sseFrame(event, typeof data === 'string' ? data : JSON.stringify(data)));
  }

  dropStreams() {
    for (const res of this.streams) res.destroy();
  }

  async stop() {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

interface StreamEvent {
  event: string;
  data: string;
  comment?: string;
}

/** Reads an SSE response; `next()` resolves with the next event (or comment / retry line marker). */
async function openStream(base: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const res = await fetch(`${base}/v1/x/stream`, { headers, signal: controller.signal });
  const queue: StreamEvent[] = [];
  const raw: string[] = [];
  let ended = false;
  let wake: (() => void) | undefined;
  const parser = new SseParser();
  void (async () => {
    try {
      const decoder = new TextDecoder();
      if (!res.body) return;
      for await (const chunk of res.body) {
        const text = decoder.decode(chunk, { stream: true });
        raw.push(text);
        queue.push(...parser.push(text));
        wake?.();
      }
    } catch {
      // aborted by the test
    } finally {
      ended = true;
      wake?.();
    }
  })();
  const next = async (timeoutMs = 3000): Promise<StreamEvent | undefined> => {
    const deadline = Date.now() + timeoutMs;
    while (queue.length === 0 && !ended) {
      if (Date.now() > deadline) throw new Error(`no SSE event within ${timeoutMs}ms; raw=${raw.join('')}`);
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, 50);
      });
    }
    return queue.shift();
  };
  const untilEnd = async (timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (!ended) {
      if (Date.now() > deadline) throw new Error('stream did not end');
      await sleep(20);
    }
    return raw.join('');
  };
  return { res, next, untilEnd, raw, close: () => controller.abort() };
}

async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await sleep(20);
  }
}

describe('SseParser', () => {
  it('parses events split across chunks, CRLF, multi-line data and comments', () => {
    const p = new SseParser();
    expect(p.push('event: po')).toEqual([]);
    expect(p.push('st\r\ndata: {"a":1}\r\n\r\n: ping\n\nretry: 5\n\n')).toEqual([
      { event: 'post', data: '{"a":1}' },
      { event: '', data: '', comment: 'ping' },
    ]);
    expect(p.push('data: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('rejects an unbounded line', () => {
    const p = new SseParser(16);
    expect(() => p.push('data: 0123456789abcdef')).toThrow(/size limit/);
  });
});

describe('config', () => {
  it('defaults the relay to loopback and rejects a bad URL', () => {
    expect(loadConfig({}).xFeed).toEqual({ relayUrl: 'http://127.0.0.1:3010', maxStreams: 1000, maxStreamsPerIp: 8 });
    expect(() => loadConfig({ X_RELAY_URL: 'ftp://x' })).toThrow(/X_RELAY_URL/);
  });
});

describe('X feed routes', () => {
  let relay: FakeRelay;
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await relay?.stop();
  });

  async function start(
    env: Record<string, string> = {},
    hubOpts: Partial<ConstructorParameters<typeof XFeedHub>[0]> = {},
  ) {
    relay = await new FakeRelay().start();
    const hub = new XFeedHub({
      relayUrl: relay.url,
      log: pino({ level: 'silent' }),
      connectWaitMs: 500,
      retryMs: [1000, 1000],
      retryMaxMs: 1000,
      backoffMs: [20, 50],
      ...hubOpts,
    });
    app = makeTestApp({ env: { X_RELAY_URL: relay.url, ...env }, xFeed: hub }).app;
    const base = await app.listen({ host: '127.0.0.1', port: 0 });
    return { base, hub };
  }

  describe('GET /v1/x/recent', () => {
    it('proxies the relay, drops invalid posts and keeps CORS for the app origin', async () => {
      await start();
      relay.recent = { posts: [post('2102711510573175177'), INVALID, post('2102711518970405062')] };
      const res = await app?.inject({
        method: 'GET',
        url: '/v1/x/recent?limit=2',
        headers: { origin: APP_ORIGIN },
      });
      expect(res?.statusCode).toBe(200);
      expect(res?.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
      const body = res?.json();
      expect(body.posts.map((p: XPost) => p.id)).toEqual(['2102711510573175177', '2102711518970405062']);
    });

    it('validates limit', async () => {
      await start();
      const res = await app?.inject({ method: 'GET', url: '/v1/x/recent?limit=500' });
      expect(res?.statusCode).toBe(400);
      expect(res?.json().error.code).toBe('validation_failed');
    });

    it('answers 503 x_feed_unavailable when the relay is down or broken', async () => {
      await start();
      relay.recentStatus = 500;
      const down = await app?.inject({ method: 'GET', url: '/v1/x/recent' });
      expect(down?.statusCode).toBe(503);
      expect(down?.headers['retry-after']).toBe('15');
      expect(down?.json().error.code).toBe('x_feed_unavailable');

      relay.recentStatus = 200;
      relay.recent = 'not json';
      const garbage = await app?.inject({ method: 'GET', url: '/v1/x/recent' });
      expect(garbage?.json().error.code).toBe('x_feed_unavailable');

      await relay.stop();
      const gone = await app?.inject({ method: 'GET', url: '/v1/x/recent' });
      expect(gone?.statusCode).toBe(503);
      relay = await new FakeRelay().start();
    });
  });

  describe('GET /v1/x/post/:id', () => {
    const ID = '2102711510573175177';

    it('returns a post the relay saw, signals included', async () => {
      await start();
      relay.posts.set(ID, { ...post(ID), signals: ['cashtag', 'keyword'] });
      const res = await app?.inject({ method: 'GET', url: `/v1/x/post/${ID}`, headers: { origin: APP_ORIGIN } });
      expect(res?.statusCode).toBe(200);
      expect(res?.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
      expect(res?.json()).toMatchObject({ id: ID, signals: ['cashtag', 'keyword'] });
    });

    it('answers 404 x_post_not_found for an id the relay does not know', async () => {
      await start();
      const res = await app?.inject({ method: 'GET', url: '/v1/x/post/2102711518970405062' });
      expect(res?.statusCode).toBe(404);
      expect(res?.json().error.code).toBe('x_post_not_found');
    });

    it('validates the id', async () => {
      await start();
      for (const id of ['12a', '123456789012345678901', '-1']) {
        const res = await app?.inject({ method: 'GET', url: `/v1/x/post/${id}` });
        expect(res?.statusCode).toBe(400);
        expect(res?.json().error.code).toBe('validation_failed');
      }
    });

    it('answers 503 x_feed_unavailable when the relay is down, outdated or sends garbage', async () => {
      const { hub } = await start();
      relay.posts.set(ID, 404);
      const outdated = await app?.inject({ method: 'GET', url: `/v1/x/post/${ID}` });
      expect(outdated?.statusCode).toBe(503);
      expect(outdated?.headers['retry-after']).toBe('15');
      expect(outdated?.json().error.code).toBe('x_feed_unavailable');

      relay.posts.set(ID, { ...post(ID), id: '1' });
      const mismatched = await app?.inject({ method: 'GET', url: `/v1/x/post/${ID}` });
      expect(mismatched?.statusCode).toBe(503);
      expect(hub.stats().invalidDropped).toBe(1);

      await relay.stop();
      const gone = await app?.inject({ method: 'GET', url: `/v1/x/post/${ID}` });
      expect(gone?.statusCode).toBe(503);
      relay = await new FakeRelay().start();
    });
  });

  describe('GET /v1/x/stream', () => {
    it('streams snapshot, then validated post and delete events, with SSE headers', async () => {
      const { base } = await start();
      relay.snapshot = [post('2102711510573175177'), INVALID];
      const s = await openStream(base, { origin: APP_ORIGIN });
      expect(s.res.status).toBe(200);
      expect(s.res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(s.res.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(s.res.headers.get('x-accel-buffering')).toBe('no');
      expect(s.res.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);

      const snapshot = await s.next();
      expect(snapshot?.event).toBe('snapshot');
      expect(JSON.parse(snapshot?.data ?? '').posts.map((p: XPost) => p.id)).toEqual(['2102711510573175177']);
      expect(s.raw.join('')).toMatch(/^retry: 1000\n\n/);

      relay.emit('post', INVALID);
      relay.emit('post', '{broken');
      relay.emit('post', post('2102711518970405062'));
      relay.emit('delete', { id: '2102711510573175177' });
      relay.emit('delete', { nope: true });
      const p = await s.next();
      expect(p?.event).toBe('post');
      expect(XPost.parse(JSON.parse(p?.data ?? '')).id).toBe('2102711518970405062');
      const d = await s.next();
      expect(d).toEqual({ event: 'delete', data: '{"id":"2102711510573175177"}' });
      s.close();
    });

    it('fans one upstream connection out to many clients and cleans up on disconnect', async () => {
      const { base, hub } = await start();
      const a = await openStream(base);
      const b = await openStream(base);
      expect((await a.next())?.event).toBe('snapshot');
      expect((await b.next())?.event).toBe('snapshot');
      expect(relay.streamConnections).toBe(1);
      expect(hub.stats().clients).toBe(2);

      relay.emit('post', post('2102711518970405062'));
      expect((await a.next())?.event).toBe('post');
      expect((await b.next())?.event).toBe('post');

      a.close();
      await waitFor(() => hub.stats().clients === 1);
      b.close();
      await waitFor(() => hub.stats().clients === 0);
      expect(hub.stats().invalidDropped).toBe(0);
    });

    it('sends pings', async () => {
      const { base } = await start({}, { pingIntervalMs: 50 });
      const s = await openStream(base);
      expect((await s.next())?.event).toBe('snapshot');
      expect(await s.next()).toEqual({ event: '', data: '', comment: 'ping' });
      s.close();
    });

    it('answers 200 + retry hint and closes when the relay is unreachable', async () => {
      const { base } = await start();
      await relay.stop();
      const s = await openStream(base);
      expect(s.res.status).toBe(200);
      expect(await s.untilEnd()).toBe('retry: 1000\n\n');
      relay = await new FakeRelay().start();
    });

    it('closes clients with a retry hint when the upstream drops, then serves a fresh snapshot', async () => {
      const { base, hub } = await start();
      const s = await openStream(base);
      expect((await s.next())?.event).toBe('snapshot');
      relay.dropStreams();
      expect(await s.untilEnd()).toMatch(/retry: 1000\n\n$/);
      expect(hub.stats().clients).toBe(0);

      relay.snapshot = [post('2102711518970405062')];
      const again = await openStream(base);
      const snap = await again.next();
      expect(JSON.parse(snap?.data ?? '').posts[0].id).toBe('2102711518970405062');
      expect(relay.streamConnections).toBe(2);
      again.close();
    });

    it('passes signals through and still accepts posts without them', async () => {
      const { base } = await start();
      relay.snapshot = [{ ...post('2102711510573175177'), signals: ['ca_sol'] }];
      const s = await openStream(base);
      const snapshot = JSON.parse((await s.next())?.data ?? '');
      expect(snapshot.posts[0].signals).toEqual(['ca_sol']);
      relay.emit('post', post('2102711518970405062'));
      const p = JSON.parse((await s.next())?.data ?? '');
      expect(p.id).toBe('2102711518970405062');
      expect('signals' in p).toBe(false);
      s.close();
    });

    it('hints a fast first retry after a live relay drops, then backs off while it stays down', async () => {
      const { base } = await start({}, { retryMs: [100, 100], retryMaxMs: 8000 });
      const s = await openStream(base);
      expect((await s.next())?.event).toBe('snapshot');
      relay.dropStreams();
      await relay.stop();
      expect(await s.untilEnd()).toMatch(/retry: 100\n\n$/);

      // This client waits connectWaitMs (500) for the relay first, so its hint sees an outage of >= 500 ms.
      const later = await openStream(base);
      const hint = Number(/retry: (\d+)/.exec(await later.untilEnd())?.[1]);
      expect(hint).toBeGreaterThanOrEqual(200);
      expect(hint).toBeLessThanOrEqual(8000);
      relay = await new FakeRelay().start();
    });

    it('limits concurrent streams per client IP', async () => {
      const { base, hub } = await start({ X_FEED_MAX_STREAMS_PER_IP: '1' });
      const first = await openStream(base);
      expect((await first.next())?.event).toBe('snapshot');
      const second = await fetch(`${base}/v1/x/stream`);
      expect(second.status).toBe(429);
      expect(((await second.json()) as ApiError).error.code).toBe('rate_limited');
      first.close();
      await waitFor(() => hub.stats().clients === 0);
      const third = await openStream(base);
      expect(third.res.status).toBe(200);
      third.close();
    });

    it('drops a client that stopped reading instead of buffering without bound', async () => {
      const { hub } = await start({}, { maxBufferedBytes: 1024 });
      let destroyed = false;
      const stalled = {
        write: () => undefined,
        end: () => undefined,
        destroy: () => {
          destroyed = true;
        },
        buffered: () => 4096,
      };
      expect(await hub.attach(stalled)).toBe(true);
      relay.emit('post', post('2102711518970405062'));
      await waitFor(() => destroyed);
      expect(hub.stats()).toMatchObject({ clients: 0, slowClientsDropped: 1 });
    });

    it('ends open streams on shutdown so close() does not hang', async () => {
      const { base } = await start();
      const s = await openStream(base);
      expect((await s.next())?.event).toBe('snapshot');
      const started = Date.now();
      await app?.close();
      app = undefined;
      expect(Date.now() - started).toBeLessThan(3000);
      expect(await s.untilEnd()).toMatch(/retry: 1000\n\n$/);
    });
  });
});
