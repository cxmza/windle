import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../context.ts';
import { isInternalRequest } from '../lib/client-ip.ts';
import { safeEqual } from '../lib/crypto.ts';
import { type Check, portalCsp, renderPortal } from '../portal/render.ts';
import { VERSION } from '../version.ts';

export const READY_TIMEOUT_MS = 1_500;

const CheckSchema = z.object({
  status: z.enum(['up', 'down']).describe('Whether the dependency answered within the timeout.'),
  latencyMs: z
    .number()
    .describe('Round-trip time of the ping, in milliseconds.')
    .meta({ examples: [2] }),
});
const Ready = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({ postgres: CheckSchema, redis: CheckSchema }),
});

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function appendVary(current: unknown, value: string): string {
  const existing = Array.isArray(current) ? current.join(', ') : typeof current === 'string' ? current : '';
  const parts = existing
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!parts.some((v) => v.toLowerCase() === value.toLowerCase())) parts.push(value);
  return parts.join(', ');
}

export async function probe(ctx: AppContext, log: FastifyInstance['log']) {
  const run = async (name: 'postgres' | 'redis', fn: () => Promise<unknown>): Promise<Check> => {
    const started = performance.now();
    let status: 'up' | 'down' = 'up';
    try {
      await withTimeout(fn(), READY_TIMEOUT_MS);
    } catch (err) {
      status = 'down';
      // Drizzle wraps driver errors ("Failed query: ..."); the cause carries the useful part (ECONNREFUSED, auth).
      const e = err as Error & { cause?: Error };
      log.warn({ dependency: name, err: { message: e.cause?.message ?? e.message } }, 'readiness probe failed');
    }
    const latencyMs = Math.round(performance.now() - started);
    ctx.metrics.dependencyUp.set({ dependency: name }, status === 'up' ? 1 : 0);
    ctx.metrics.dependencyLatency.set({ dependency: name }, latencyMs / 1000);
    return { status, latencyMs };
  };
  const [postgres, redis] = await Promise.all([
    run('postgres', () => ctx.repo.ping()),
    run('redis', () => ctx.store.ping()),
  ]);
  return { postgres, redis };
}

/** Content negotiation for GET /: a browser (Accept lists text/html above JSON) gets the HTML home page. */
export function prefersHtml(accept: string | undefined): boolean {
  if (!accept) return false;
  const q = (type: string) => {
    let best = -1;
    for (const part of accept.split(',')) {
      const [media, ...params] = part.trim().toLowerCase().split(';');
      if (media?.trim() !== type) continue;
      const qp = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const value = qp ? Number(qp.slice(2)) : 1;
      best = Math.max(best, Number.isFinite(value) ? value : 0);
    }
    return best;
  };
  const html = q('text/html');
  return html > 0 && html > q('application/json');
}

/** Same probe as /ready, shared by concurrent portal views and reused for a few seconds (the page must not be a DB pump). */
export const STATUS_CACHE_MS = 5_000;

const IndexBody = z
  .object({
    name: z
      .string()
      .describe('Service name.')
      .meta({ examples: ['windle-api'] }),
    version: z
      .string()
      .describe('API package version.')
      .meta({ examples: ['0.1.0'] }),
    commit: z.string().optional().describe('Build identifier of the running release.'),
    status: z.literal('ok'),
    docs: z.url().describe('Human documentation.'),
    reference: z.url().describe('Interactive API reference.'),
    openapi: z.url().describe('OpenAPI 3.1 document.'),
    health: z.url().describe('Liveness endpoint.'),
  })
  .describe('Service index.');

export async function systemRoutes(app: FastifyInstance, ctx: AppContext, extraMetrics?: () => string[]) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const noLimit = { rateLimit: false as const };

  let statusCache: { at: number; value: Promise<{ postgres: Check; redis: Check }> } | undefined;
  const cachedProbe = (log: FastifyInstance['log']) => {
    const now = Date.now();
    if (!statusCache || now - statusCache.at > STATUS_CACHE_MS) statusCache = { at: now, value: probe(ctx, log) };
    return statusCache;
  };

  r.get(
    '/',
    {
      schema: {
        tags: ['System'],
        summary: 'Service index',
        description:
          'A small JSON index of the service. Browsers (an `Accept` header preferring `text/html`) get the ' +
          'windle API home page instead; the response varies on `Accept`.',
        response: { 200: IndexBody },
      },
    },
    async (request, reply) => {
      reply.header('vary', appendVary(reply.getHeader('vary'), 'Accept'));
      if (prefersHtml(request.headers.accept)) {
        const checks = await cachedProbe(request.log).value;
        const nonce = randomBytes(16).toString('base64');
        const html = renderPortal({
          nonce,
          version: VERSION,
          commit: ctx.config.commit,
          env: ctx.config.env,
          apiOrigin: ctx.config.publicApiOrigin,
          docsOrigin: ctx.config.publicDocsOrigin,
          checks,
        });
        // The zod provider types the body as the JSON index; a string with a non-JSON content type is sent as-is.
        return reply
          .header('content-security-policy', portalCsp(nonce))
          .type('text/html; charset=utf-8')
          .send(html as never);
      }
      return {
        name: 'windle-api',
        version: VERSION,
        ...(ctx.config.commit ? { commit: ctx.config.commit } : {}),
        status: 'ok' as const,
        docs: ctx.config.publicDocsOrigin,
        reference: `${ctx.config.publicApiOrigin}/reference`,
        openapi: `${ctx.config.publicApiOrigin}/openapi.json`,
        health: `${ctx.config.publicApiOrigin}/health`,
      };
    },
  );

  // Liveness: the process is up and the event loop answers. No dependency checks (a DB outage must not get the
  // container restarted in a loop).
  r.get(
    '/health',
    {
      config: noLimit,
      schema: {
        tags: ['System'],
        summary: 'Liveness',
        description:
          'The process is up and its event loop answers. Never checks dependencies, so a database outage does not ' +
          'get healthy containers restarted. Not rate limited.',
        response: { 200: z.object({ status: z.literal('ok') }).describe('Alive.') },
      },
    },
    async () => ({ status: 'ok' as const }),
  );

  // Readiness: can this instance serve traffic (Postgres + Redis answer within the timeout)?
  r.get(
    '/ready',
    {
      config: noLimit,
      schema: {
        tags: ['System'],
        summary: 'Readiness (Postgres + Redis)',
        description:
          'Pings Postgres and Redis (1.5 s timeout each) and reports per-dependency status and latency. ' +
          'Answers `503` with the same body when either is down. Not rate limited.',
        response: {
          200: Ready.describe('Both dependencies answered.'),
          503: Ready.describe('At least one dependency is down or timed out.'),
        },
      },
    },
    async (request, reply) => {
      const checks = await probe(ctx, request.log);
      const ok = checks.postgres.status === 'up' && checks.redis.status === 'up';
      return reply.code(ok ? 200 : 503).send({ status: ok ? 'ready' : 'not_ready', checks });
    },
  );

  // Prometheus scrape. Internal only: a direct (non-proxied) request from loopback / the docker bridge, or a
  // Bearer METRICS_TOKEN. Anything else gets the same 404 as an unknown route.
  r.get('/metrics', { config: noLimit, schema: { hide: true } }, async (request, reply) => {
    const auth = request.headers.authorization;
    const token = ctx.config.metricsToken;
    const byToken = token !== undefined && auth !== undefined && safeEqual(auth, `Bearer ${token}`);
    if (!byToken && !isInternalRequest(request, ctx.trust)) return reply.callNotFound();
    await probe(ctx, request.log);
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(ctx.metrics.render(extraMetrics));
  });
}
