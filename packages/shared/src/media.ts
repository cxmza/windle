import { SolanaAddress } from './common.ts';
import { z } from './zod.ts';

/**
 * User images (market/token image, profile avatar). Uploads are normalized server-side into one WebP master whose
 * sha256 is the media id; every size the UI shows is a signed cdn.windle.fun/img/ URL rendered from that master.
 * URLs are content-addressed and never change for an id, so they are cached for a year everywhere.
 */

export const MEDIA_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MediaUploadType = z.enum(MEDIA_UPLOAD_TYPES);
export type MediaUploadType = z.infer<typeof MediaUploadType>;

export const MEDIA_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MEDIA_MAX_INPUT_PIXELS = 40_000_000;
export const MEDIA_MAX_EDGE = 2048;

export const MEDIA_KINDS = ['market', 'avatar'] as const;
export const MediaKind = z
  .enum(MEDIA_KINDS)
  .describe('What the image is for. Informational; any owned image may be attached anywhere.');
export type MediaKind = z.infer<typeof MediaKind>;

export const MediaId = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'not a media id')
  .describe('sha256 (hex) of the normalized master image. Same image, same id.')
  .meta({ examples: ['3f1c2a9b8e7d6c5b4a3928170615f4e3d2c1b0a99887766554433221100ffeed'] });
export type MediaId = z.infer<typeof MediaId>;

export const IMAGE_PRESETS = ['avatar64', 'avatar128', 'thumb', 'card', 'cover', 'og'] as const;
export type ImagePreset = (typeof IMAGE_PRESETS)[number];

export const ApiImageUrls = z
  .object({
    avatar64: z.url().describe('64x64 square, smart crop.'),
    avatar128: z.url().describe('128x128 square, smart crop.'),
    thumb: z.url().describe('160x160 square, smart crop.'),
    card: z.url().describe('Fits inside 480x480, aspect kept.'),
    cover: z.url().describe('Fits inside 1200x1200, aspect kept.'),
    og: z.url().describe('1200x630 JPEG, smart crop (link previews).'),
  })
  .describe('Signed CDN URLs per display preset. Immutable: cache forever.');
export type ApiImageUrls = z.infer<typeof ApiImageUrls>;

export const ApiImage = z
  .object({
    id: MediaId,
    width: z.number().int().positive().describe('Width of the master in pixels (long edge at most 2048).'),
    height: z.number().int().positive(),
    thumbhash: z
      .string()
      .min(1)
      .max(64)
      .describe('ThumbHash (base64) for an instant blurred placeholder; decode with `thumbHashToDataURL`.'),
    alt: z.string().max(300).optional(),
    urls: ApiImageUrls,
  })
  .describe('An uploaded image with its placeholder and CDN URLs.');
export type ApiImage = z.infer<typeof ApiImage>;

export const MediaUploadQuery = z.object({
  kind: MediaKind.default('market'),
});
export type MediaUploadQuery = z.input<typeof MediaUploadQuery>;

export const MediaUploadResponse = z
  .object({
    image: ApiImage,
    created: z.boolean().describe('False when the exact same image was uploaded before (same id returned).'),
  })
  .describe('The stored image. Attach it with its `id`.');
export type MediaUploadResponse = z.infer<typeof MediaUploadResponse>;

export const SetAvatarRequest = z.object({
  mediaId: MediaId.nullable().describe('An image you uploaded, or null to remove the avatar.'),
});
export type SetAvatarRequest = z.infer<typeof SetAvatarRequest>;

export const SetAvatarResponse = z.object({ avatar: ApiImage.nullable() });
export type SetAvatarResponse = z.infer<typeof SetAvatarResponse>;

export const MEDIA_REPORT_REASONS = [
  'csam',
  'sexual',
  'violence',
  'hate',
  'impersonation',
  'spam',
  'copyright',
  'other',
] as const;
export const MediaReportReason = z.enum(MEDIA_REPORT_REASONS);
export type MediaReportReason = z.infer<typeof MediaReportReason>;

export const MediaReportRequest = z.object({
  reason: MediaReportReason,
  note: z.string().trim().min(1).max(500).optional(),
});
export type MediaReportRequest = z.infer<typeof MediaReportRequest>;

export const MediaReportResponse = z.object({ reported: z.literal(true) });
export type MediaReportResponse = z.infer<typeof MediaReportResponse>;

export const AdminMediaRemoveResponse = z.object({
  id: MediaId,
  removed: z.boolean().describe('False when it was already removed (idempotent).'),
  detachedMarkets: z.number().int().min(0),
  detachedAvatars: z.number().int().min(0),
  cdnPurged: z
    .enum(['purged', 'not_configured', 'failed'])
    .describe('Cloudflare purge by URL. `not_configured`: purge manually (see infra/README.md "Media pipeline").'),
});
export type AdminMediaRemoveResponse = z.infer<typeof AdminMediaRemoveResponse>;

export const AdminMediaReport = z.object({
  image: ApiImage,
  owner: SolanaAddress.nullable(),
  reports: z.number().int().min(1),
  reasons: z.array(MediaReportReason),
  lastReportedAt: z.iso.datetime(),
});
export type AdminMediaReport = z.infer<typeof AdminMediaReport>;

export const AdminMediaReportsResponse = z.object({
  items: z.array(AdminMediaReport).describe('Active reported images, most reports first.'),
});
export type AdminMediaReportsResponse = z.infer<typeof AdminMediaReportsResponse>;
