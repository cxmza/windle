import { createHmac } from 'node:crypto';
import type { ApiImage, ApiImageUrls, ImagePreset } from '@windle/shared';
import { MediaStorage } from './storage.ts';
import type { MediaRecord } from './types.ts';

/**
 * Signed imgproxy URLs, exactly as infra/scripts/imgproxy-url.sh mints them:
 *   <cdn>/img/<base64url(HMAC-SHA256(key, salt || path))>/<path>,  path = /<options>/plain/<source>[@format]
 * imgproxy runs with IMGPROXY_BASE_URL=local:/// and its root at /srv/windle, so a master is `media/<ab>/<id>.webp`.
 */

export interface SignerConfig {
  cdnOrigin: string;
  key: string;
  salt: string;
}

export function signPath(path: string, key: string, salt: string): string {
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(Buffer.from(salt, 'hex'))
    .update(path)
    .digest('base64url');
}

export function imgproxyUrl(cfg: SignerConfig, options: string, source: string, format?: string): string {
  const path = `/${options}/plain/${source}${format ? `@${format}` : ''}`;
  return `${cfg.cdnOrigin}/img/${signPath(path, cfg.key, cfg.salt)}${path}`;
}

/** `pinned`: a fixed format so Cloudflare can cache it. og is always JPEG: every link-preview crawler reads it. */
export const PRESETS: Record<ImagePreset, { options: string; pinned: 'webp' | 'jpg' }> = {
  avatar64: { options: 'rs:fill:64:64:1/g:sm', pinned: 'webp' },
  avatar128: { options: 'rs:fill:128:128:1/g:sm', pinned: 'webp' },
  thumb: { options: 'rs:fill:160:160:1/g:sm', pinned: 'webp' },
  card: { options: 'rs:fit:480:480', pinned: 'webp' },
  cover: { options: 'rs:fit:1200:1200', pinned: 'webp' },
  og: { options: 'rs:fill:1200:630:1/g:sm', pinned: 'jpg' },
};

export const mediaSource = (id: string) => `media/${MediaStorage.key(id)}`;

export function presetUrls(cfg: SignerConfig, id: string, mode: 'webp' | 'auto'): ApiImageUrls {
  const source = mediaSource(id);
  const url = (p: ImagePreset) => {
    const { options, pinned } = PRESETS[p];
    return imgproxyUrl(cfg, options, source, mode === 'auto' && pinned === 'webp' ? undefined : pinned);
  };
  return {
    avatar64: url('avatar64'),
    avatar128: url('avatar128'),
    thumb: url('thumb'),
    card: url('card'),
    cover: url('cover'),
    og: url('og'),
  };
}

export function toApiImage(m: MediaRecord, cfg: SignerConfig, mode: 'webp' | 'auto'): ApiImage {
  return { id: m.id, width: m.width, height: m.height, thumbhash: m.thumbhash, urls: presetUrls(cfg, m.id, mode) };
}

/** Every URL a CDN may hold for this image, whichever URL mode was live when it was cached. */
export function cachedUrls(cfg: SignerConfig, id: string): string[] {
  return [...new Set([...Object.values(presetUrls(cfg, id, 'webp')), ...Object.values(presetUrls(cfg, id, 'auto'))])];
}
