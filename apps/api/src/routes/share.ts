import { MarketSlug } from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../context.ts';
import { dep, HttpError } from '../errors.ts';
import type { MarketRecord } from '../markets/types.ts';
import { publicStatus } from '../markets/view.ts';
import { fetchAvatar, marketImageDataUri, OG_HEIGHT, OG_TEMPLATE_VERSION, OG_WIDTH, renderOgPng } from '../share/og.ts';

const SlugParams = z.object({ slug: MarketSlug });
/** Crawlers (X, Telegram, Discord) fetch once and cache on their side; the URL changes when the odds do. */
const PAGE_CACHE = 'public, max-age=300';
const IMAGE_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';
/**
 * Cards that show a user upload: a takedown purges only the current `?v=` URL, so older odds variants must expire
 * from shared caches (Cloudflare) on their own, quickly.
 */
const USER_IMAGE_CACHE = 'public, max-age=300';
const IMAGE_TTL_SECONDS = 24 * 3600;
const FALLBACK_IMAGE = 'https://cdn.windle.fun/og.png';
const SHARE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const pct = (p: number) => `${Math.round(p * 100)}%`;

/**
 * The image URL carries the rounded odds, the status and the market image: a moved market (or one whose image was
 * taken down) gets a new URL, so no cache serves a stale card.
 */
export function imageVersion(m: MarketRecord, now: Date, imageId: string | null = null): string {
  const base = `${OG_TEMPLATE_VERSION}-${Math.round(m.probYes * 100)}-${publicStatus(m, now)}`;
  return imageId ? `${base}-i${imageId.slice(0, 12)}` : base;
}

function describe(m: MarketRecord, now: Date): string {
  const status = publicStatus(m, now);
  const odds = `YES ${pct(m.probYes)} · NO ${pct(1 - m.probYes)}`;
  const state =
    status === 'resolved'
      ? `Resolved ${m.outcome?.toUpperCase() ?? ''}`
      : status === 'voided'
        ? 'Voided'
        : status === 'closed'
          ? 'Trading closed'
          : 'Live';
  return `${odds} — ${state}. Call it with practice points on windle (no real money).`;
}

export function sharePage(
  m: MarketRecord,
  opts: { appOrigin: string; apiOrigin: string; now: Date; imageId?: string | null },
): string {
  const target = `${opts.appOrigin}/m/${m.slug}`;
  const image = `${opts.apiOrigin}/v1/og/m/${m.slug}.png?v=${imageVersion(m, opts.now, opts.imageId ?? null)}`;
  const title = escapeHtml(m.statement);
  const description = escapeHtml(describe(m, opts.now));
  const alt = escapeHtml(`${m.statement} — ${describe(m, opts.now)}`);
  const url = escapeHtml(target);
  const img = escapeHtml(image);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · windle</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="windle">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${OG_WIDTH}">
<meta property="og:image:height" content="${OG_HEIGHT}">
<meta property="og:image:alt" content="${alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${alt}">
<meta http-equiv="refresh" content="0; url=${url}">
</head>
<body style="background:#000314;color:#f4f6fb;font-family:system-ui,sans-serif;padding:32px">
<p>Opening <a style="color:#43acfb" href="${url}">${title}</a> on windle…</p>
</body>
</html>
`;
}

function notFoundPage(appOrigin: string): string {
  const url = escapeHtml(appOrigin);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>windle</title>
<meta http-equiv="refresh" content="0; url=${url}"></head>
<body><p>This market does not exist. <a href="${url}">Open windle</a>.</p></body></html>
`;
}

export async function shareRoutes(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { publicAppOrigin: appOrigin, publicApiOrigin: apiOrigin } = ctx.config;
  const inFlight = new Map<string, Promise<Buffer>>();
  /** The market image id while that image is active; null otherwise. */
  const activeImage = async (m: MarketRecord): Promise<string | null> => {
    const id = m.imageId;
    if (id === null) return null;
    return (await dep('postgres', () => ctx.media.repo.activeByIds([id]))).has(id) ? id : null;
  };

  r.get(
    '/v1/share/m/:slug',
    {
      schema: {
        tags: ['Share'],
        summary: 'Share page of a market',
        description:
          'A tiny HTML page with Open Graph and X card tags (`summary_large_image`) for link previews; people are ' +
          'sent on to the market in the app (meta refresh + link). Served publicly as `https://app.windle.fun/s/{slug}`.',
        params: SlugParams,
        produces: ['text/html'],
      },
    },
    async (request, reply) => {
      const now = ctx.now();
      const m = await dep('postgres', () => ctx.markets.marketBySlug(request.params.slug));
      reply.header('content-type', 'text/html; charset=utf-8').header('content-security-policy', SHARE_CSP);
      if (!m) return reply.code(404).header('cache-control', 'public, max-age=60').send(notFoundPage(appOrigin));
      const imageId = await activeImage(m);
      return reply.header('cache-control', PAGE_CACHE).send(sharePage(m, { appOrigin, apiOrigin, now, imageId }));
    },
  );

  const render = async (m: MarketRecord, key: string, imageId: string | null): Promise<Buffer> => {
    const cached = await ctx.cache.get(key).catch(() => null);
    if (cached) return cached;
    const now = ctx.now();
    const author = m.source?.author;
    const png = await renderOgPng({
      statement: m.statement,
      probYes: m.probYes,
      status: publicStatus(m, now),
      tier: m.tier,
      outcome: m.outcome,
      ticker: m.project.ticker,
      author: author ? { handle: author.handle, name: author.name } : null,
      avatar: await fetchAvatar(author?.avatarUrl),
      image: imageId ? await marketImageDataUri(await ctx.media.storage.read(imageId).catch(() => null)) : null,
    });
    await ctx.cache.set(key, png, IMAGE_TTL_SECONDS).catch(() => {});
    return png;
  };

  r.get(
    '/v1/og/m/:slug(^[a-z0-9-]+).png',
    {
      schema: {
        tags: ['Share'],
        summary: 'Share image of a market',
        description:
          `${OG_WIDTH}x${OG_HEIGHT} PNG: the question, YES/NO odds, the tweet author and the windle mark. Cached per ` +
          'rounded odds and status. Errors are the usual JSON envelope (`404 market_not_found`, `429`, `503`); a ' +
          'failed render redirects to the generic windle card.',
        params: SlugParams,
        produces: ['image/png'],
      },
      config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    },
    async (request, reply) => {
      const now = ctx.now();
      const m = await dep('postgres', () => ctx.markets.marketBySlug(request.params.slug));
      if (!m) throw new HttpError(404, 'market_not_found', 'No market with this slug');
      const imageId = await activeImage(m);
      const key = `og:${imageVersion(m, now, imageId)}:${m.slug}:${m.outcome ?? '-'}`;
      let job = inFlight.get(key);
      if (!job) {
        job = render(m, key, imageId).finally(() => inFlight.delete(key));
        inFlight.set(key, job);
      }
      let png: Buffer;
      try {
        png = await job;
      } catch (err) {
        request.log.error({ err }, 'og image render failed');
        return reply.code(302).header('cache-control', 'no-store').header('location', FALLBACK_IMAGE).send();
      }
      return reply
        .header('content-type', 'image/png')
        .header('cache-control', imageId ? USER_IMAGE_CACHE : IMAGE_CACHE)
        .header('cross-origin-resource-policy', 'cross-origin')
        .send(png);
    },
  );
}
