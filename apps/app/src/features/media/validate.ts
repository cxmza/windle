import { MEDIA_MAX_INPUT_PIXELS, MEDIA_MAX_UPLOAD_BYTES, type MediaUploadType } from '@windle/shared';
import { type Dimensions, readHeaderSize, sniffImageType } from './sniff';

export const MIN_EDGE = 64;

export type FileProblemCode = 'empty' | 'type' | 'too_large' | 'too_small' | 'too_many_pixels' | 'unreadable';

export interface FileProblem {
  code: FileProblemCode;
  message: string;
}

export interface FileInfo extends Partial<Dimensions> {
  type: MediaUploadType;
}

export type Inspection = { ok: true; info: FileInfo } | { ok: false; problem: FileProblem };

const HEAD_BYTES = 128 * 1024;

const MB = 1024 * 1024;

/** Sizes people can compare with the limit: MB rounded up to a tenth (so 10 MB plus a byte is not "10.0"), else KB. */
export function formatBytes(n: number): string {
  if (n < MB) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = Math.ceil((n / MB) * 10) / 10;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

const problem = (code: FileProblemCode, message: string): Inspection => ({ ok: false, problem: { code, message } });

export const PROBLEM_COPY = {
  empty: 'That file is empty. Choose another image.',
  type: 'Use a JPG, PNG or WebP image. Other formats, such as GIF or HEIC, are not supported.',
  unreadable: 'We could not read that file as an image. Try exporting it again.',
  tooLarge: (size: number) =>
    `That file is ${formatBytes(size)}. The limit is ${formatBytes(MEDIA_MAX_UPLOAD_BYTES)}. Export it smaller and try again.`,
  tooSmall: (d: Dimensions) => `That image is ${d.width}×${d.height}. Use one at least ${MIN_EDGE}×${MIN_EDGE} pixels.`,
  tooManyPixels: (d: Dimensions) =>
    `That image is ${d.width}×${d.height}, over the ${MEDIA_MAX_INPUT_PIXELS / 1_000_000} megapixel limit. Resize it and try again.`,
} as const;

async function headOf(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
}

/**
 * The checks that need no network: size, the real type from the magic bytes (the name and `type` can lie) and the
 * pixel size from the header. The server repeats all of them; this only makes the refusal instant.
 */
export async function inspectFile(file: Blob): Promise<Inspection> {
  if (file.size === 0) return problem('empty', PROBLEM_COPY.empty);
  let head: Uint8Array;
  try {
    head = await headOf(file);
  } catch {
    return problem('unreadable', PROBLEM_COPY.unreadable);
  }
  const type = sniffImageType(head);
  if (!type) return problem('type', PROBLEM_COPY.type);
  if (file.size > MEDIA_MAX_UPLOAD_BYTES) return problem('too_large', PROBLEM_COPY.tooLarge(file.size));
  const size = readHeaderSize(head, type);
  if (size) {
    if (Math.min(size.width, size.height) < MIN_EDGE) return problem('too_small', PROBLEM_COPY.tooSmall(size));
    if (size.width * size.height > MEDIA_MAX_INPUT_PIXELS)
      return problem('too_many_pixels', PROBLEM_COPY.tooManyPixels(size));
  }
  return { ok: true, info: { type, ...(size ?? {}) } };
}
