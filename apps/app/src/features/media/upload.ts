import { type MediaKind, MediaUploadResponse } from '@windle/shared';
import { ApiRequestError } from '@/lib/api';
import { API_URL } from '@/lib/env';

const UPLOAD_TIMEOUT_MS = 120_000;

export interface UploadOptions {
  kind: MediaKind;
  /** 0..1 of the request body sent. Reaches 1 before the server has answered: it still re-encodes the image. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  baseUrl?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function failureFrom(status: number, text: string): ApiRequestError {
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const err = isRecord(body) ? body.error : null;
  const message = isRecord(err) && typeof err.message === 'string' ? err.message : `HTTP ${status}`;
  const code = isRecord(err) && typeof err.code === 'string' ? err.code : null;
  return new ApiRequestError('http', message, status, code);
}

const aborted = () => new DOMException('The upload was cancelled.', 'AbortError');

/**
 * POST /v1/media with the raw bytes. XMLHttpRequest, not fetch: only XHR reports how much of the body has gone out.
 * Rejects with ApiRequestError, or with an AbortError DOMException when `signal` fires.
 */
export function uploadImage(blob: Blob, type: string, options: UploadOptions): Promise<MediaUploadResponse> {
  const { kind, onProgress, signal, baseUrl = API_URL } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/v1/media?kind=${encodeURIComponent(kind)}`);
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', type);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        const parsed = MediaUploadResponse.safeParse(body);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiRequestError('schema', 'The API answered with an unexpected shape.', xhr.status));
        return;
      }
      reject(failureFrom(xhr.status, xhr.responseText));
    };
    xhr.onerror = () => reject(new ApiRequestError('network', 'Could not reach the windle API.'));
    xhr.ontimeout = () => reject(new ApiRequestError('network', 'The upload timed out.', null, 'upload_timeout'));
    xhr.onabort = () => reject(aborted());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

export const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const CODE_COPY = {
  unauthenticated: 'Your session ended. Sign in again, then upload the image.',
  csrf_rejected: 'The browser request was blocked for safety. Reload the page and try again.',
  unsupported_media_type: 'Use a JPG, PNG or WebP image.',
  media_type_mismatch: 'The file contents do not match its type. Export it again as JPG, PNG or WebP.',
  media_invalid: 'We could not read that image. Try another file, or export it again.',
  media_too_many_pixels: 'That image has too many pixels. Resize it below 40 megapixels and try again.',
  rate_limited: 'Too many requests. Wait a minute and try again.',
  media_quota_exceeded: 'You have reached your upload limit for now. Try again later.',
  media_removed: 'That image was removed by moderators and cannot be used. Choose another one.',
  media_busy: 'The image service is busy. Try again in a few seconds.',
  media_storage_full: 'Image storage is full right now. Try again later.',
  upload_timeout: 'The upload took too long. Check your connection and try again.',
} as const;

const copyFor = (code: string | null): string | undefined =>
  code !== null && Object.hasOwn(CODE_COPY, code) ? CODE_COPY[code as keyof typeof CODE_COPY] : undefined;

const STATUS_COPY: Readonly<Record<number, string>> = {
  401: CODE_COPY.unauthenticated,
  403: CODE_COPY.csrf_rejected,
  410: CODE_COPY.media_removed,
  413: 'That file is too large. The limit is 10 MB.',
  415: CODE_COPY.unsupported_media_type,
  422: CODE_COPY.media_invalid,
  429: CODE_COPY.rate_limited,
  503: CODE_COPY.media_busy,
  507: CODE_COPY.media_storage_full,
};

/** One sentence a person can act on for a failed media request; `fallback` covers codes without their own copy. */
export function mediaErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (error.kind === 'network') return copyFor(error.code) ?? 'The connection dropped. Check it and try again.';
  if (error.kind === 'schema') return fallback;
  const byCode = copyFor(error.code);
  if (byCode) return byCode;
  const byStatus = error.status === null ? undefined : STATUS_COPY[error.status];
  return byStatus ?? fallback;
}

export const uploadErrorMessage = (error: unknown): string => mediaErrorMessage(error, 'The upload failed. Try again.');

const FINAL_CODES = new Set([
  'unsupported_media_type',
  'media_type_mismatch',
  'media_invalid',
  'media_too_many_pixels',
  'media_removed',
]);

/** False when sending the same file again cannot succeed, so the screen offers only "choose another". */
export function canRetry(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return true;
  if (error.status === 413 || error.status === 415 || error.status === 422 || error.status === 410) return false;
  return !(error.code && FINAL_CODES.has(error.code));
}
