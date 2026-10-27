import type { ApiImage, MediaKind } from '@windle/shared';
import { MEDIA_MAX_EDGE, MEDIA_MAX_INPUT_PIXELS } from '@windle/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { MediaConfig } from '../config.ts';
import { HttpError } from '../errors.ts';
import type { Metrics } from '../lib/metrics.ts';
import { Gate, GateFull, MediaRejected, processImage, type RejectReason, type SourceFormat } from './process.ts';
import type { MediaStorage } from './storage.ts';
import type { MediaRecord, MediaRepository } from './types.ts';
import { cachedUrls, type SignerConfig, toApiImage } from './urls.ts';

const REJECT_HTTP: Record<RejectReason, [number, 'media_type_mismatch' | 'media_invalid' | 'media_too_many_pixels']> = {
  type_mismatch: [415, 'media_type_mismatch'],
  invalid: [422, 'media_invalid'],
  too_many_pixels: [422, 'media_too_many_pixels'],
};

const CF_PURGE_BATCH = 30;

export type PurgeResult = 'purged' | 'not_configured' | 'failed';

export interface MediaServiceDeps {
  repo: MediaRepository;
  storage: MediaStorage;
  config: MediaConfig;
  metrics: Metrics;
  log: FastifyBaseLogger;
  now: () => Date;
  fetch?: typeof fetch;
}

/** Uploads, lookups for DTOs, ownership checks and takedowns. Routes go through this, never the repo directly. */
export class MediaService {
  readonly repo: MediaRepository;
  readonly storage: MediaStorage;
  private readonly config: MediaConfig;
  private readonly metrics: Metrics;
  private readonly log: FastifyBaseLogger;
  private readonly now: () => Date;
  private readonly fetch: typeof fetch;
  private readonly gate: Gate;
  readonly signer: SignerConfig;

  constructor(deps: MediaServiceDeps) {
    this.repo = deps.repo;
    this.storage = deps.storage;
    this.config = deps.config;
    this.metrics = deps.metrics;
    this.log = deps.log;
    this.now = deps.now;
    this.fetch = deps.fetch ?? fetch;
    this.gate = new Gate(deps.config.maxConcurrent, deps.config.maxQueue);
    this.signer = { cdnOrigin: deps.config.cdnOrigin, key: deps.config.imgproxyKey, salt: deps.config.imgproxySalt };
  }

  image(m: MediaRecord): ApiImage {
    return toApiImage(m, this.signer, this.config.urlFormat);
  }

  /** Active images by id (removed or unknown ids are left out). */
  async images(ids: ReadonlyArray<string | null>): Promise<Map<string, ApiImage>> {
    const wanted = ids.filter((id): id is string => id !== null);
    const out = new Map<string, ApiImage>();
    if (wanted.length === 0) return out;
    for (const [id, m] of await this.repo.activeByIds(wanted)) out.set(id, this.image(m));
    return out;
  }

  async avatars(userIds: readonly string[]): Promise<Map<string, ApiImage>> {
    const out = new Map<string, ApiImage>();
    if (userIds.length === 0) return out;
    for (const [userId, m] of await this.repo.avatarsByUserIds(userIds)) out.set(userId, this.image(m));
    return out;
  }

  async avatarOf(userId: string): Promise<ApiImage | null> {
    return (await this.avatars([userId])).get(userId) ?? null;
  }

  private reject(reason: string, err: HttpError): HttpError {
    this.metrics.mediaRejects.inc({ reason });
    return err;
  }

  async upload(input: {
    body: Buffer;
    format: SourceFormat;
    userId: string;
    kind: MediaKind;
  }): Promise<{ image: ApiImage; created: boolean }> {
    const cap = this.config.maxTotalBytes;
    if ((await this.repo.totalActiveBytes()) >= cap)
      throw this.reject('storage_full', new HttpError(507, 'media_storage_full', 'Image storage is full, try later'));

    const started = performance.now();
    let processed: Awaited<ReturnType<typeof processImage>>;
    try {
      processed = await this.gate.run(() =>
        processImage(input.body, input.format, { maxPixels: MEDIA_MAX_INPUT_PIXELS, maxEdge: MEDIA_MAX_EDGE }),
      );
    } catch (err) {
      if (err instanceof GateFull)
        throw this.reject(
          'busy',
          new HttpError(503, 'media_busy', 'Too many uploads right now, retry shortly', { 'retry-after': '5' }),
        );
      if (err instanceof MediaRejected) {
        const [status, code] = REJECT_HTTP[err.reason];
        throw this.reject(err.reason, new HttpError(status, code, err.message));
      }
      throw err;
    }
    this.metrics.mediaProcessing.observe({}, (performance.now() - started) / 1000);
    this.metrics.mediaBytes.inc({ stage: 'received' }, input.body.length);

    const existing = await this.repo.get(processed.id);
    if (existing?.status === 'removed')
      throw this.reject('removed', new HttpError(410, 'media_removed', 'This image was taken down'));
    if (!existing && (await this.repo.totalActiveBytes()) + processed.data.length > cap)
      throw this.reject('storage_full', new HttpError(507, 'media_storage_full', 'Image storage is full, try later'));

    if (!(await this.storage.has(processed.id))) {
      await this.storage.write(processed.id, processed.data);
      this.metrics.mediaBytes.inc({ stage: 'stored' }, processed.data.length);
    }
    const { media, created } = await this.repo.insert({
      id: processed.id,
      ownerId: input.userId,
      kind: input.kind,
      width: processed.width,
      height: processed.height,
      bytes: processed.data.length,
      thumbhash: processed.thumbhash,
      createdAt: this.now(),
    });
    // A takedown can land between the lookup above and the insert: never hand out an image that is gone.
    if (media.status === 'removed')
      throw this.reject('removed', new HttpError(410, 'media_removed', 'This image was taken down'));
    this.metrics.mediaUploads.inc({ result: created ? 'created' : 'deduped' });
    if (processed.animated) this.log.info({ id: media.id }, 'animated upload flattened to its first frame');
    return { image: this.image(media), created };
  }

  /** The image `userId` may attach: it exists, is active and they uploaded it. */
  async attachable(id: string, userId: string): Promise<MediaRecord> {
    const m = await this.repo.get(id);
    if (!m) throw new HttpError(404, 'media_not_found', 'No image with this id');
    if (m.status === 'removed') throw new HttpError(410, 'media_removed', 'This image was taken down');
    if (!(await this.repo.isUploader(id, userId)))
      throw new HttpError(403, 'media_not_owned', 'Upload the image yourself before using it');
    return m;
  }

  /** Deletes the master (imgproxy and the nginx gate then answer 404) and purges Cloudflare by URL when configured. */
  async purge(id: string, extraUrls: readonly string[]): Promise<PurgeResult> {
    await this.storage.remove(id);
    const cf = this.config.cloudflare;
    const urls = [...cachedUrls(this.signer, id), ...extraUrls];
    if (!cf) {
      this.log.warn({ id, urls }, 'media removed; Cloudflare purge not configured, purge these URLs manually');
      return 'not_configured';
    }
    try {
      for (let i = 0; i < urls.length; i += CF_PURGE_BATCH) {
        const res = await this.fetch(`https://api.cloudflare.com/client/v4/zones/${cf.zoneId}/purge_cache`, {
          method: 'POST',
          headers: { authorization: `Bearer ${cf.apiToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ files: urls.slice(i, i + CF_PURGE_BATCH) }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await res.json().catch(() => null)) as { success?: unknown } | null;
        if (!res.ok || body?.success !== true) throw new Error(`cloudflare purge: HTTP ${res.status}`);
      }
      return 'purged';
    } catch (err) {
      this.log.error({ err, id, urls }, 'media removed; Cloudflare purge failed, purge these URLs manually');
      return 'failed';
    }
  }
}
