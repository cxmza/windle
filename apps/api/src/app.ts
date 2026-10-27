import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import scalarReference from '@scalar/fastify-api-reference';
import { SESSION_COOKIE } from '@windle/shared';
import Fastify, { type FastifyInstance, type FastifyRequest, LogController } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import { authRoutes } from './auth/routes.ts';
import type { Config } from './config.ts';
import type { AppContext } from './context.ts';
import { HttpError, registerErrorHandling } from './errors.ts';
import { clientIp, createTrustList, isTrusted } from './lib/client-ip.ts';
import { createMetrics, type Metrics } from './lib/metrics.ts';
import type { Rng } from './markets/bots/model.ts';
import { MarketBots } from './markets/bots/runner.ts';
import { MemoryMarketRepository } from './markets/memory.ts';
import type { MarketRepository } from './markets/types.ts';
import { MemoryMediaRepository } from './media/memory.ts';
import { MediaService } from './media/service.ts';
import { MediaStorage } from './media/storage.ts';
import type { MediaRepository } from './media/types.ts';
import { REFERENCE_CSP, referenceConfiguration } from './reference.ts';
import { marketRoutes } from './routes/markets.ts';
import { mediaRoutes } from './routes/media.ts';
import { shareRoutes } from './routes/share.ts';
import { systemRoutes } from './routes/system.ts';
import { xFeedRoutes } from './routes/x-feed.ts';
import { type CacheStore, MemoryCacheStore } from './store/cache.ts';
import type { EphemeralStore, UserRepository } from './store/types.ts';
import { VERSION } from './version.ts';
import { MemoryXEnrichStore, XEnricher, type XEnrichStore } from './x-feed/enrich.ts';
import { XFeedHub } from './x-feed/hub.ts';
import { resolveTco, TwitterApiClient } from './x-feed/twitterapi.ts';

export interface AppDeps {
  store: EphemeralStore;
  repo: UserRepository;
  /** Rate-limit counters live here when given; otherwise in process memory (tests, single-instance dev). */
  rateLimitRedis?: Redis;
  metrics?: Metrics;
  now?: () => Date;
  /** Extra Prometheus lines (pool/client gauges) appended to /metrics. */
  extraMetrics?: () => string[];
  /** Fan-out to the X feed relay; built from config.xFeed when omitted. */
  xFeed?: XFeedHub;
  /** Enrichment cache + credit budget; in process memory when omitted (tests, single-instance dev). */
  xEnrichStore?: XEnrichStore;
  /** fetch for twitterapi.io and t.co (tests). */
  xEnrichFetch?: typeof fetch;
  /** Markets, trades, balances; in process memory when omitted (tests, single-instance dev). */
  markets?: MarketRepository;
  /** Leaderboard and share-image cache; in process memory when omitted. */
  cache?: CacheStore;
  /** Randomness of the house market bots (tests); Math.random when omitted. */
  botsRng?: Rng;
  /** Image metadata; in process memory when omitted (tests, single-instance dev). Masters go to MEDIA_ROOT. */
  media?: MediaRepository;
  /** fetch for the Cloudflare purge API (tests). */
  mediaFetch?: typeof fetch;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Strict CSP for JSON responses: nothing may load, nothing may frame. /reference gets its own (see reference.ts). */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function buildApp(config: Config, deps: AppDeps): FastifyInstance {
  const trust = createTrustList(config.trustProxy);
  const metrics = deps.metrics ?? createMetrics();
  const allowedOrigins = new Set(config.corsOrigins);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Defense in depth: the serializers below never emit these, but a stray `log.info({ req })` must not either.
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
          'headers.cookie',
          'headers.authorization',
          '*.signature',
          '*.signedMessage',
          '*.token',
          'body.signature',
          'body.signedMessage',
        ],
        censor: '[redacted]',
      },
      serializers: {
        req: (req: FastifyRequest) => ({ method: req.method, url: req.url, ip: req.clientIp || undefined }),
      },
    },
    // One summary line per request is written in onResponse (below) instead of Fastify's two.
    logController: new LogController({ disableRequestLogging: true }),
    // Proxy headers are honoured only from TRUST_PROXY hops; request.ip then reflects X-Forwarded-For.
    trustProxy: (address: string) => isTrusted(trust, address),
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
    bodyLimit: config.bodyLimit,
    // nginx: proxy_read_timeout 60s > this.
    requestTimeout: 30_000,
    // Longer than nginx's upstream keepalive so nginx always closes idle connections first (no reset races).
    keepAliveTimeout: 65_000,
    return503OnClosing: true,
    routerOptions: { ignoreTrailingSlash: true, maxParamLength: 200 },
  });

  const xFeed =
    deps.xFeed ?? new XFeedHub({ relayUrl: config.xFeed.relayUrl, log: app.log.child({ module: 'x-feed' }) });
  const now = deps.now ?? (() => new Date());
  const enrichFetch = deps.xEnrichFetch ?? fetch;
  const { apiKey, baseUrl, dailyBudget } = config.xEnrich;
  const xEnrich = new XEnricher({
    client: apiKey ? new TwitterApiClient({ apiKey, baseUrl, fetch: enrichFetch }) : undefined,
    store: deps.xEnrichStore ?? new MemoryXEnrichStore(() => now().getTime()),
    hub: xFeed,
    log: app.log.child({ module: 'x-enrich' }),
    now,
    dailyBudget,
    resolveTco: (url) => resolveTco(url, enrichFetch),
    results: metrics.xEnrich,
    credits: metrics.xEnrichCredits,
  });
  const ctx: AppContext = {
    config,
    store: deps.store,
    repo: deps.repo,
    metrics,
    trust,
    now,
    xFeed,
    xEnrich,
    markets: deps.markets ?? new MemoryMarketRepository(),
    cache: deps.cache ?? new MemoryCacheStore({ now: () => now().getTime() }),
    media: new MediaService({
      repo: deps.media ?? new MemoryMediaRepository(),
      storage: new MediaStorage(config.media.root),
      config: config.media,
      metrics,
      log: app.log.child({ module: 'media' }),
      now,
      ...(deps.mediaFetch ? { fetch: deps.mediaFetch } : {}),
    }),
  };

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app, { exposeInternalMessages: !config.isProd });

  // Only JSON bodies. text/plain is a CORS "simple" type, so accepting it would let a cross-site form post
  // skip the preflight; removing the parser makes such requests 415.
  app.removeContentTypeParser('text/plain');

  app.decorateRequest('clientIp', '');
  app.addHook('onRequest', async (request, reply) => {
    request.clientIp = clientIp(request, trust);
    reply.header('x-request-id', request.id);
  });

  // --- security headers -------------------------------------------------------------------------------------
  app.register(fastifyHelmet, {
    // CSP is written per response in onSend (strict for the API, relaxed for /reference).
    contentSecurityPolicy: false,
    // HSTS is owned by nginx for every windle host (and hidden from upstream responses there).
    strictTransportSecurity: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  app.addHook('onSend', async (request, reply) => {
    const isReference = request.url.startsWith('/reference');
    // A handler may set a stricter per-response policy (the portal's nonce CSP on GET /); otherwise API-strict.
    if (isReference) reply.header('content-security-policy', REFERENCE_CSP);
    else if (!reply.hasHeader('content-security-policy')) reply.header('content-security-policy', API_CSP);
    if (!reply.hasHeader('cache-control') && !isReference) reply.header('cache-control', 'no-store');
  });

  // --- CORS: exact-origin allow-list, credentials ------------------------------------------------------------
  app.register(fastifyCors, {
    origin: (origin, cb) => cb(null, origin !== undefined && allowedOrigins.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: [
      'X-Request-Id',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Date',
    ],
    maxAge: 600,
    strictPreflight: true,
  });

  // --- CSRF: state-changing requests must come from an allowed origin ----------------------------------------
  // The session cookie is SameSite=Lax (blocks cross-site POSTs from other sites), but every *.windle.fun host is
  // "same-site", so Lax alone would trust any subdomain. Origin (or Referer) must be on the exact allow-list.
  // A request with neither header and no cookie carries no ambient authority (curl, server-to-server) and passes.
  app.addHook('onRequest', async (request) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (!allowedOrigins.has(origin)) throw new HttpError(403, 'csrf_rejected', 'Origin is not allowed');
      return;
    }
    const referer = request.headers.referer;
    if (referer !== undefined) {
      const refOrigin = URL.canParse(referer) ? new URL(referer).origin : '';
      if (!allowedOrigins.has(refOrigin)) throw new HttpError(403, 'csrf_rejected', 'Referer is not allowed');
      return;
    }
    if (request.headers.cookie?.includes(`${SESSION_COOKIE}=`))
      throw new HttpError(403, 'csrf_rejected', 'Origin header is required for cookie-authenticated requests');
  });

  app.register(fastifyCookie);

  // --- rate limits: per client IP, Redis-backed in production --------------------------------------------------
  app.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowSeconds * 1000,
    keyGenerator: (request) => clientIp(request, trust),
    ...(deps.rateLimitRedis ? { redis: deps.rateLimitRedis, nameSpace: 'wl:rl:' } : {}),
    // If Redis is down, do not turn every request into a 500: nginx limit_req still caps traffic per IP.
    skipOnError: true,
    errorResponseBuilder: (_request, context) =>
      new HttpError(429, 'rate_limited', `Too many requests, retry in ${Math.ceil(context.ttl / 1000)}s`, {
        'retry-after': String(Math.ceil(context.ttl / 1000)),
      }),
  });

  // --- OpenAPI from the zod route schemas -----------------------------------------------------------------------
  app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'windle API',
        version: VERSION,
        description: [
          'Sign-in and accounts for windle.fun. JSON over HTTPS; public routes are versioned under `/v1`.',
          '',
          '**Authentication.** Sign-In With Solana: get a single-use input from `GET /v1/auth/siws/nonce`, have the ' +
            'wallet sign it (`solana:signIn`), then `POST /v1/auth/siws/verify`. The session is an HttpOnly cookie ' +
            '(`wl_session`, Domain=.windle.fun), so browser clients call with `credentials: "include"`. There are no API keys.',
          '',
          '**Browsers.** Credentialed CORS is limited to an exact-origin allow-list; state-changing requests from other ' +
            'origins get `403 csrf_rejected`.',
          '',
          '**Errors.** Every non-2xx body is `{ "error": { "code", "message", "requestId" } }`. Branch on `code`.',
          '',
          '**Rate limits.** Per client IP; `429 rate_limited` with `Retry-After` and `X-RateLimit-*` headers.',
          '',
          '**Request ids.** Every response has `X-Request-Id`; send your own to correlate logs.',
        ].join('\n'),
        contact: { name: 'windle', url: `${config.publicDocsOrigin}/api/overview/` },
      },
      externalDocs: { description: 'Guides', url: `${config.publicDocsOrigin}/api/overview/` },
      servers: [{ url: config.publicApiOrigin }],
      // Order here is the order in the reference sidebar and on the portal.
      tags: [
        { name: 'System', description: 'Service index, liveness and readiness.' },
        { name: 'Auth', description: 'Sign-In With Solana and cookie sessions.' },
        { name: 'Account', description: 'The signed-in user.' },
        { name: 'X feed', description: 'Live posts of tracked KOL and founder accounts on X (JSON + SSE).' },
        {
          name: 'Markets',
          description:
            'Prediction markets on tweets, traded with practice points (no real value; every account starts at ' +
            '1000). LMSR pricing, automatic settlement, leaderboard.',
        },
        { name: 'Share', description: 'Link previews of markets: share page and Open Graph image.' },
        {
          name: 'Media',
          description:
            'User images (market image, avatar): upload once, attach by id, served from cdn.windle.fun in fixed ' +
            'sizes. Reports and admin takedown.',
        },
      ],
      components: {
        securitySchemes: {
          session: {
            type: 'apiKey',
            in: 'cookie',
            name: SESSION_COOKIE,
            description:
              'HttpOnly session cookie set by POST /v1/auth/siws/verify. Browsers send it with `credentials: "include"`.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  app.register(async (scope) => {
    await systemRoutes(scope, ctx, () => [...(deps.extraMetrics?.() ?? []), ...xFeedMetrics(xFeed)]);
    await authRoutes(scope, ctx);
    await xFeedRoutes(scope, ctx);
    await marketRoutes(scope, ctx);
    await shareRoutes(scope, ctx);
    await mediaRoutes(scope, ctx);
    scope.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  });

  app.register(scalarReference, { routePrefix: '/reference', configuration: referenceConfiguration() });

  // --- one access-log line + metrics per request -------------------------------------------------------------
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const status = reply.statusCode;
    const seconds = reply.elapsedTime / 1000;
    metrics.httpRequests.inc({ method: request.method, route, status: String(status) });
    metrics.httpDuration.observe({ method: request.method, route }, seconds);
    const quiet = route === '/health' || route === '/ready' || route === '/metrics';
    const line = {
      method: request.method,
      route,
      url: request.url,
      status,
      ms: Math.round(reply.elapsedTime),
      ip: request.clientIp,
    };
    if (status >= 500 && status !== 503) request.log.error(line, 'request failed');
    else if (status === 503) request.log.warn(line, 'request unavailable');
    else if (!quiet) request.log.info(line, 'request');
  });

  if (config.bots.enabled) {
    const bots = new MarketBots({
      repo: ctx.markets,
      store: deps.store,
      config: config.bots,
      now,
      log: app.log.child({ module: 'market-bots' }),
      ...(deps.botsRng ? { rng: deps.botsRng } : {}),
    });
    app.addHook('onReady', async () => bots.start());
    // Before onClose (which ends the Postgres pool in server.ts): a running tick finishes, the lease is released.
    app.addHook('preClose', async () => bots.stop());
  }

  // Open SSE streams would keep server.close() waiting; end them (with a retry hint) before it runs.
  app.addHook('preClose', async () => xFeed.close());
  app.addHook('onClose', async () => metrics.stop());
  return app;
}

function xFeedMetrics(hub: XFeedHub): string[] {
  const s = hub.stats();
  return [
    '# HELP windle_x_feed_live 1 if the upstream stream from x-relay is live.',
    '# TYPE windle_x_feed_live gauge',
    `windle_x_feed_live ${s.live ? 1 : 0}`,
    '# HELP windle_x_feed_clients Open GET /v1/x/stream connections.',
    '# TYPE windle_x_feed_clients gauge',
    `windle_x_feed_clients ${s.clients}`,
    '# HELP windle_x_feed_events_total X feed hub counters (see `event` label).',
    '# TYPE windle_x_feed_events_total counter',
    `windle_x_feed_events_total{event="upstream_session"} ${s.upstreamSessions}`,
    `windle_x_feed_events_total{event="invalid_dropped"} ${s.invalidDropped}`,
    `windle_x_feed_events_total{event="slow_client_dropped"} ${s.slowClientsDropped}`,
  ];
}
