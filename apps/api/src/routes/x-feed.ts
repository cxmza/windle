import { PassThrough } from 'node:stream';
import { ApiError, XPost, XPostId, XRecentResponse } from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../context.ts';
import { errorBody, HttpError } from '../errors.ts';
import { XEnrichUnavailable } from '../x-feed/enrich.ts';
import { type XFeedClient, XFeedUnavailable } from '../x-feed/hub.ts';

const RETRY_AFTER_SECONDS = '15';
const ENRICH_RETRY_AFTER_SECONDS = '60';

const RecentQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('How many posts to return, newest first (1-100, default 50).'),
});

const PostParams = z.object({
  id: XPostId.describe('Tweet id: 1-20 digits, as in `https://x.com/<handle>/status/<id>`.'),
});

const PostQuery = z.object({
  enrich: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .describe('`1`: fetch the full post from X (any public post, with metrics, video variants, card, poll, article).'),
});

const POST_DESCRIPTION = [
  'Without `enrich`: a post of a tracked KOL or founder account that the feed saw recently (the relay keeps the ' +
    'last ~5000, including posts the feed itself does not show), e.g. to resolve a pasted tweet link. ' +
    '`404 x_post_not_found` when the feed has not seen the id (another account, too old, or deleted); ' +
    '`503 x_feed_unavailable` (with `Retry-After`) when the feed relay is down.',
  '',
  'With `enrich=1`: the full post from X for any public post, for links a user pastes or opens (never for the ' +
    'whole live feed): verified type and affiliate badge, media sizes, alt text and playable video variants, ' +
    'metrics, link card, poll, X article, url entities, language, conversation and thread flags; `source` is ' +
    '`twitterapi` and `enrichedAt` says when X was asked. A post the feed also has keeps its `author.tags`, ' +
    '`signals` and `receivedAt`. Cached: refetched at most every 5 minutes (metrics), kept 24 h. Errors: ' +
    '`404 x_post_not_found` (deleted, protected or no such post), `429 rate_limited` (per client IP, cache ' +
    'hits are free), `503 x_enrich_unavailable` with `Retry-After` (enrichment off, X source down or the daily ' +
    'budget spent) — fall back to the plain lookup.',
].join('\n');

const STREAM_DESCRIPTION = [
  'Server-Sent Events (`text/event-stream`). Use `new EventSource(url)`; no credentials are needed.',
  '',
  '- `snapshot` once on connect: `{ "posts": XPost[] }`, newest first (up to 50);',
  '- `post`: one `XPost`, new or enriched — replace any post with the same `id`;',
  '- `delete`: `{ "id" }` — remove that post;',
  '- `: ping` comment every 15 s.',
  '',
  'When the feed is unavailable the stream answers `200` with only a `retry:` hint and closes, so EventSource ' +
    'reconnects by itself after that delay and gets a fresh `snapshot`. Concurrent streams are limited per IP ' +
    '(`429 rate_limited`).',
].join('\n');

export async function xFeedRoutes(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const hub = ctx.xFeed;
  const { maxStreams, maxStreamsPerIp } = ctx.config.xFeed;
  const perIp = new Map<string, number>();
  let open = 0;

  r.get(
    '/v1/x/recent',
    {
      schema: {
        tags: ['X feed'],
        summary: 'Recent X posts',
        description:
          'Newest posts of tracked KOL and founder accounts on X, newest first. The same data the stream ' +
          'starts with; use it for a first paint or without EventSource. Answers `503 x_feed_unavailable` ' +
          '(with `Retry-After`) when the feed relay is down.',
        querystring: RecentQuery,
        response: { 200: XRecentResponse, 400: ApiError, 429: ApiError, 503: ApiError },
      },
    },
    async (request, reply) => {
      try {
        return { posts: await hub.recent(request.query.limit) };
      } catch (err) {
        if (!(err instanceof XFeedUnavailable)) throw err;
        request.log.warn({ err: { message: err.message } }, 'x feed relay unavailable');
        return reply
          .code(503)
          .header('retry-after', RETRY_AFTER_SECONDS)
          .send(errorBody(request, 'x_feed_unavailable', 'The X feed is temporarily unavailable, retry shortly'));
      }
    },
  );

  const { ratePerMinute } = ctx.config.xEnrich;
  const enrichLimit = app.createRateLimit({
    max: ratePerMinute,
    timeWindow: 60_000,
    keyGenerator: (request) => `x-enrich:${request.clientIp}`,
  });

  r.get(
    '/v1/x/post/:id',
    {
      schema: {
        tags: ['X feed'],
        summary: 'One X post by id',
        description: POST_DESCRIPTION,
        params: PostParams,
        querystring: PostQuery,
        response: { 200: XPost, 400: ApiError, 404: ApiError, 429: ApiError, 503: ApiError },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (request.query.enrich === '1' || request.query.enrich === 'true') {
        let enriched: XPost | undefined;
        try {
          enriched = await ctx.xEnrich.post(id, {
            beforeUpstream: async () => {
              const limit = await enrichLimit(request);
              if (!limit.isAllowed && limit.isExceeded) {
                const retry = String(Math.max(1, limit.ttlInSeconds));
                throw new HttpError(429, 'rate_limited', `Too many post lookups, retry in ${retry}s`, {
                  'retry-after': retry,
                });
              }
            },
          });
        } catch (err) {
          if (!(err instanceof XEnrichUnavailable)) throw err;
          return reply
            .code(503)
            .header('retry-after', ENRICH_RETRY_AFTER_SECONDS)
            .send(errorBody(request, 'x_enrich_unavailable', 'Full X post data is temporarily unavailable'));
        }
        if (!enriched) {
          return reply
            .code(404)
            .send(errorBody(request, 'x_post_not_found', 'X has no such public post (deleted, protected or unknown)'));
        }
        return enriched;
      }

      let post: XPost | undefined;
      try {
        post = await hub.post(id);
      } catch (err) {
        if (!(err instanceof XFeedUnavailable)) throw err;
        request.log.warn({ err: { message: err.message } }, 'x feed relay unavailable');
        return reply
          .code(503)
          .header('retry-after', RETRY_AFTER_SECONDS)
          .send(errorBody(request, 'x_feed_unavailable', 'The X feed is temporarily unavailable, retry shortly'));
      }
      if (!post) {
        return reply
          .code(404)
          .send(errorBody(request, 'x_post_not_found', 'The X feed has not seen this post recently'));
      }
      return post;
    },
  );

  r.get(
    '/v1/x/stream',
    {
      schema: {
        tags: ['X feed'],
        summary: 'Live X posts (SSE)',
        description: STREAM_DESCRIPTION,
        produces: ['text/event-stream'],
        response: {
          200: z.string().describe('An endless `text/event-stream`.'),
          429: ApiError,
          503: ApiError,
        },
      },
    },
    async (request, reply) => {
      const ip = request.clientIp;
      if (open >= maxStreams) {
        return reply
          .code(503)
          .header('retry-after', RETRY_AFTER_SECONDS)
          .send(errorBody(request, 'x_feed_unavailable', 'Too many open feed streams, retry shortly'));
      }
      if ((perIp.get(ip) ?? 0) >= maxStreamsPerIp) {
        return reply
          .code(429)
          .header('retry-after', RETRY_AFTER_SECONDS)
          .send(errorBody(request, 'rate_limited', `At most ${maxStreamsPerIp} open feed streams per client`));
      }
      open++;
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);

      const stream = new PassThrough();
      const client: XFeedClient = {
        write: (chunk) => {
          if (!stream.destroyed && !stream.writableEnded) stream.write(chunk);
        },
        end: (chunk) => {
          if (!stream.destroyed && !stream.writableEnded) stream.end(chunk);
        },
        destroy: () => stream.destroy(),
        buffered: () => stream.writableLength + stream.readableLength,
      };
      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        hub.detach(client);
        open--;
        const left = (perIp.get(ip) ?? 1) - 1;
        if (left > 0) perIp.set(ip, left);
        else perIp.delete(ip);
        // A stream usually ends by the client going away, which skips the onResponse access-log line.
        request.log.info({ ip, ms: Math.round(reply.elapsedTime) }, 'x feed stream closed');
      };
      reply.raw.once('close', cleanup);
      stream.once('close', cleanup);

      void hub.attach(client).then((attached) => {
        if (attached && finished) hub.detach(client);
      });

      // The zod provider types the body as the declared schemas; a stream is piped as-is, never serialized.
      return reply
        .header('content-type', 'text/event-stream; charset=utf-8')
        .header('cache-control', 'no-cache, no-transform')
        .header('x-accel-buffering', 'no')
        .header('connection', 'keep-alive')
        .send(stream as never);
    },
  );
}
