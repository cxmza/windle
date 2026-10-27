import {
  AdminMediaRemoveResponse,
  AdminMediaReportsResponse,
  ApiError,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_UPLOAD_TYPES,
  MediaId,
  MediaReportRequest,
  MediaReportResponse,
  MediaUploadQuery,
  MediaUploadResponse,
  SetAvatarRequest,
  SetAvatarResponse,
} from '@windle/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type ActiveSession, renewSession, requireSession } from '../auth/session.ts';
import type { AppContext } from '../context.ts';
import { dep, HttpError } from '../errors.ts';
import { CONTENT_TYPE_FORMAT } from '../media/process.ts';
import { imageVersion } from './share.ts';

const IdParams = z.object({ id: MediaId });
const DAY_MS = 86_400_000;
const REPORTS_PER_HOUR = 20;
const errors = {
  400: ApiError,
  401: ApiError,
  403: ApiError,
  404: ApiError,
  409: ApiError,
  410: ApiError,
  413: ApiError,
  415: ApiError,
  422: ApiError,
  429: ApiError,
  503: ApiError,
  507: ApiError,
};

export async function mediaRoutes(app: FastifyInstance, ctx: AppContext) {
  const media = ctx.media;
  const sessions = new WeakMap<FastifyRequest, ActiveSession>();

  const perUser = (name: string, max: number, timeWindow: number, code: 'rate_limited' | 'media_quota_exceeded') => {
    const limit = app.createRateLimit({
      max,
      timeWindow,
      keyGenerator: (request) => `${name}:${sessions.get(request)?.record.userId ?? request.clientIp}`,
    });
    return async (request: FastifyRequest) => {
      const res = await limit(request);
      if (!res.isAllowed && res.isExceeded) {
        const retry = String(Math.max(1, res.ttlInSeconds));
        const message =
          code === 'media_quota_exceeded'
            ? `Daily upload limit reached, retry in ${retry}s`
            : `Too many requests, retry in ${retry}s`;
        if (code === 'media_quota_exceeded') ctx.metrics.mediaRejects.inc({ reason: 'quota' });
        throw new HttpError(429, code, message, { 'retry-after': retry });
      }
    };
  };
  const uploadBurst = perUser('media-up', ctx.config.media.uploadsPerMinute, 60_000, 'rate_limited');
  const uploadDaily = perUser('media-day', ctx.config.media.uploadsPerDay, DAY_MS, 'media_quota_exceeded');
  const reportLimit = perUser('media-report', REPORTS_PER_HOUR, 3_600_000, 'rate_limited');

  const session = async (request: FastifyRequest, reply: FastifyReply) => {
    const s = await requireSession(request, reply, ctx);
    sessions.set(request, s);
    return s;
  };
  const isAdmin = (s: ActiveSession) => ctx.config.markets.adminWallets.has(s.record.address);

  // The upload route lives in its own scope: only here are raw image bodies parsed (everything else stays JSON-only).
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      [...MEDIA_UPLOAD_TYPES],
      { parseAs: 'buffer', bodyLimit: MEDIA_MAX_UPLOAD_BYTES },
      (_request, body, done) => done(null, body),
    );
    scope.addContentTypeParser('*', (_request, _payload, done) =>
      done(
        new HttpError(415, 'unsupported_media_type', `Content-Type must be one of ${MEDIA_UPLOAD_TYPES.join(', ')}`),
      ),
    );
    const r = scope.withTypeProvider<ZodTypeProvider>();
    r.post(
      '/v1/media',
      {
        bodyLimit: MEDIA_MAX_UPLOAD_BYTES,
        // Session and limits before the body is read: anonymous or over-quota uploads cost nothing.
        onRequest: async (request, reply) => {
          await session(request, reply);
          await uploadBurst(request);
          await uploadDaily(request);
        },
        schema: {
          tags: ['Media'],
          summary: 'Upload an image',
          description: [
            'Raw image bytes as the body with `Content-Type: image/jpeg | image/png | image/webp` (no multipart), ' +
              'at most 10 MB and 40 megapixels. The bytes must really be that format (`415 media_type_mismatch`); ' +
              'unreadable files are `422 media_invalid`, oversize pixel counts `422 media_too_many_pixels`.',
            '',
            'The server rotates by EXIF, strips all metadata (EXIF/GPS, XMP, ICC after conversion to sRGB), keeps ' +
              'the first frame of an animation, caps the long edge at 2048 px and stores one WebP master. Its sha256 ' +
              'is the id: uploading the same image again returns the same id (`200`, `created: false`) instead of ' +
              '`201`. A taken-down image cannot be uploaded again (`410 media_removed`).',
            '',
            'Signed-in only. Limits per user: a few per minute (`429 rate_limited`) and a daily quota ' +
              '(`429 media_quota_exceeded`); `507 media_storage_full` when the server is out of image space, ' +
              '`503 media_busy` when too many uploads are in progress. Attach the result with ' +
              '`POST /v1/markets` (`imageId`) or `PUT /v1/me/avatar`.',
          ].join('\n'),
          security: [{ session: [] }],
          querystring: MediaUploadQuery,
          consumes: [...MEDIA_UPLOAD_TYPES],
          response: { 200: MediaUploadResponse, 201: MediaUploadResponse, ...errors },
        },
      },
      async (request, reply) => {
        const s = sessions.get(request) ?? (await session(request, reply));
        const contentType = (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        const format = CONTENT_TYPE_FORMAT[contentType];
        const body = request.body;
        if (!format || !Buffer.isBuffer(body) || body.length === 0)
          throw new HttpError(
            415,
            'unsupported_media_type',
            `Send the image bytes as ${MEDIA_UPLOAD_TYPES.join(', ')}`,
          );
        const out = await dep('postgres', () =>
          media.upload({ body, format, userId: s.record.userId, kind: request.query.kind }),
        );
        await renewSession(reply, ctx, s);
        return reply.code(out.created ? 201 : 200).send(out);
      },
    );
  });

  const r = app.withTypeProvider<ZodTypeProvider>();

  r.put(
    '/v1/me/avatar',
    {
      schema: {
        tags: ['Account'],
        summary: 'Set or clear my avatar',
        description:
          'Sets the profile image to an image you uploaded (`POST /v1/media`), or removes it with `mediaId: null`. ' +
          'Shown on `GET /v1/me`, the leaderboard and trades. `404 media_not_found`, `403 media_not_owned` (someone ' +
          "else's upload), `410 media_removed`.",
        security: [{ session: [] }],
        body: SetAvatarRequest,
        response: { 200: SetAvatarResponse, ...errors },
      },
    },
    async (request, reply) => {
      const s = await session(request, reply);
      const { mediaId } = request.body;
      const userId = s.record.userId;
      if (mediaId !== null) await dep('postgres', () => media.attachable(mediaId, userId));
      await dep('postgres', () => media.repo.setAvatar(userId, mediaId));
      await renewSession(reply, ctx, s);
      return { avatar: mediaId === null ? null : await dep('postgres', () => media.avatarOf(userId)) };
    },
  );

  r.post(
    '/v1/media/:id/report',
    {
      schema: {
        tags: ['Media'],
        summary: 'Report an image',
        description:
          'Flags an image for the moderators. One report per user per image (`409 media_already_reported`); ' +
          'limited per user per hour. Reports never hide an image by themselves: an admin reviews and takes it down.',
        security: [{ session: [] }],
        params: IdParams,
        body: MediaReportRequest,
        response: { 201: MediaReportResponse, ...errors },
      },
    },
    async (request, reply) => {
      const s = await session(request, reply);
      await reportLimit(request);
      const m = await dep('postgres', () => media.repo.get(request.params.id));
      if (!m) throw new HttpError(404, 'media_not_found', 'No image with this id');
      if (m.status === 'removed') throw new HttpError(410, 'media_removed', 'This image was already taken down');
      const fresh = await dep('postgres', () =>
        media.repo.report({
          mediaId: m.id,
          reporterId: s.record.userId,
          reason: request.body.reason,
          note: request.body.note ?? null,
          at: ctx.now(),
        }),
      );
      if (!fresh) throw new HttpError(409, 'media_already_reported', 'You already reported this image');
      request.log.warn({ mediaId: m.id, reason: request.body.reason }, 'media reported');
      return reply.code(201).send({ reported: true as const });
    },
  );

  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const s = await session(request, reply);
    if (!isAdmin(s)) throw new HttpError(403, 'forbidden', 'Admins only');
    return s;
  };

  r.get(
    '/v1/admin/media/reports',
    {
      schema: {
        tags: ['Media'],
        summary: 'Reported images (admin)',
        description: 'Active images with reports, most reported first. `ADMIN_WALLETS` only.',
        security: [{ session: [] }],
        response: { 200: AdminMediaReportsResponse, ...errors },
      },
    },
    async (request, reply) => {
      await requireAdmin(request, reply);
      const rows = await dep('postgres', () => media.repo.reported(100));
      return {
        items: rows.map((row) => ({
          image: media.image(row.media),
          owner: row.ownerAddress,
          reports: row.reports,
          reasons: row.reasons,
          lastReportedAt: row.lastReportedAt.toISOString(),
        })),
      };
    },
  );

  r.delete(
    '/v1/admin/media/:id',
    {
      schema: {
        tags: ['Media'],
        summary: 'Take an image down (admin)',
        description: [
          '`ADMIN_WALLETS` only. Marks the image removed, deletes its master from disk (every CDN size then answers ' +
            '404 at the origin at once), detaches it from markets and avatars (their DTOs show `null`), and purges ' +
            'Cloudflare by URL when the server has a purge token (`cdnPurged`). Idempotent.',
          '',
          'The same bytes cannot be uploaded again (`410 media_removed`).',
        ].join('\n'),
        security: [{ session: [] }],
        params: IdParams,
        response: { 200: AdminMediaRemoveResponse, ...errors },
      },
    },
    async (request, reply) => {
      const s = await requireAdmin(request, reply);
      const id = request.params.id;
      const now = ctx.now();
      if (!(await dep('postgres', () => media.repo.get(id))))
        throw new HttpError(404, 'media_not_found', 'No image with this id');
      const using = await dep('postgres', () => ctx.markets.marketsByImage(id));
      const removal = await dep('postgres', () => media.repo.remove(id, s.record.userId, now));
      if (!removal) throw new HttpError(404, 'media_not_found', 'No image with this id');
      const detachedMarkets = await dep('postgres', () => ctx.markets.detachImage(id));
      const shareImages = using.map(
        (m) => `${ctx.config.publicApiOrigin}/v1/og/m/${m.slug}.png?v=${imageVersion(m, now, id)}`,
      );
      const cdnPurged = await media.purge(id, shareImages);
      ctx.metrics.mediaRemovals.inc({ purge: cdnPurged });
      request.log.warn(
        { mediaId: id, by: s.record.userId, detachedMarkets, detachedAvatars: removal.detachedAvatars, cdnPurged },
        'media taken down',
      );
      return {
        id,
        removed: removal.removed,
        detachedMarkets,
        detachedAvatars: removal.detachedAvatars,
        cdnPurged,
      };
    },
  );
}
