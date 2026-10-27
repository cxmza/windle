import { MEDIA_MAX_EDGE } from '@windle/shared';
import type { FileInfo } from './validate';

/** Below this the upload is already quick and re-encoding would only cost quality. */
export const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
const QUALITY = 0.9;

export interface Plan {
  compress: boolean;
  width: number | null;
  height: number | null;
}

/** Whether to shrink a file in the browser before sending: when it is heavy, or wider than the server keeps. */
export function planCompression(size: number, info: FileInfo): Plan {
  const { width, height } = info;
  const known = width !== undefined && height !== undefined;
  const longEdge = known ? Math.max(width, height) : 0;
  const scale = longEdge > MEDIA_MAX_EDGE ? MEDIA_MAX_EDGE / longEdge : 1;
  return {
    compress: size > COMPRESS_ABOVE_BYTES || scale < 1,
    width: known ? Math.max(1, Math.round(width * scale)) : null,
    height: known ? Math.max(1, Math.round(height * scale)) : null,
  };
}

export type Encoder = (file: Blob) => Promise<Blob | null>;

/** WebP at q0.9 with the long edge capped at 2048, drawn on a canvas. Null when this browser cannot do it. */
export const canvasEncoder: Encoder = async (file) => {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MEDIA_MAX_EDGE ? MEDIA_MAX_EDGE / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
  } finally {
    bitmap.close();
  }
};

export interface Prepared {
  blob: Blob;
  type: string;
  compressed: boolean;
}

/**
 * The bytes to upload. Compresses when the plan says so, but keeps the original whenever the result is not smaller,
 * is not WebP (the browser fell back to PNG) or the encoder fails: a failed shortcut must never block the upload.
 */
export async function prepareUpload(file: Blob, info: FileInfo, encode: Encoder = canvasEncoder): Promise<Prepared> {
  const original: Prepared = { blob: file, type: info.type, compressed: false };
  const plan = planCompression(file.size, info);
  if (!plan.compress) return original;
  try {
    const out = await encode(file);
    if (out?.type !== 'image/webp' || out.size >= file.size) return original;
    return { blob: out, type: 'image/webp', compressed: true };
  } catch {
    return original;
  }
}
