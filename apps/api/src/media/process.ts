import { webcrypto } from 'node:crypto';
import type { Metadata, OutputInfo, Sharp, SharpOptions } from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';

/**
 * Upload normalization: one WebP master per image. Decoding is restricted to the three accepted formats by magic
 * bytes (sharp itself would also open TIFF, SVG, HEIF, ...), every pixel count is bounded before decoding, EXIF
 * orientation is applied and then all metadata (EXIF/GPS, XMP, ICC after conversion to sRGB, comments) is dropped,
 * animations keep their first frame only, and the long edge is capped.
 */

type SharpFactory = (input?: Buffer, options?: SharpOptions) => Sharp;

let sharpLoaded: Promise<SharpFactory> | undefined;

/**
 * sharp (native libvips) loads on first use, so boots and tests that never touch an image do not pay for it.
 * 2 vCPU shared with a co-hosted service and imgproxy: one libvips thread per image, no operation cache (masters are never reused).
 */
export function loadSharp(): Promise<SharpFactory> {
  sharpLoaded ??= import('sharp')
    .then(({ default: sharp }) => {
      sharp.concurrency(1);
      sharp.cache(false);
      return sharp;
    })
    .catch((err: unknown) => {
      sharpLoaded = undefined;
      throw err;
    });
  return sharpLoaded;
}

export type SourceFormat = 'jpeg' | 'png' | 'webp';

export const CONTENT_TYPE_FORMAT: Record<string, SourceFormat> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type RejectReason = 'type_mismatch' | 'invalid' | 'too_many_pixels';

export class MediaRejected extends Error {
  readonly reason: RejectReason;

  constructor(reason: RejectReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The format the bytes actually are, from their signature; null for anything else. */
export function sniffFormat(buf: Buffer): SourceFormat | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP')
    return 'webp';
  return null;
}

export interface ProcessOptions {
  maxPixels: number;
  maxEdge: number;
}

export interface ProcessedImage {
  id: string;
  data: Buffer;
  width: number;
  height: number;
  thumbhash: string;
  animated: boolean;
  lossless: boolean;
}

/** Below this many output pixels a PNG with transparency is kept lossless (logos: lossy alpha leaves halos). */
const LOSSLESS_MAX_PIXELS = 512 * 512;
const WEBP_QUALITY = 85;

const isPixelLimit = (err: unknown) => err instanceof Error && /pixel limit/i.test(err.message);

export async function processImage(
  input: Buffer,
  declared: SourceFormat,
  opts: ProcessOptions,
): Promise<ProcessedImage> {
  const actual = sniffFormat(input);
  if (actual !== declared)
    throw new MediaRejected('type_mismatch', `The file is ${actual ? `a ${actual}` : 'not an image'}, not ${declared}`);

  const sharp = await loadSharp();
  const decode = { limitInputPixels: opts.maxPixels, failOn: 'error' as const, sequentialRead: true };
  let meta: Metadata;
  try {
    meta = await sharp(input, decode).metadata();
  } catch (err) {
    if (isPixelLimit(err)) throw new MediaRejected('too_many_pixels', 'The image has too many pixels');
    throw new MediaRejected('invalid', 'The image could not be read');
  }
  if (meta.format !== declared || !meta.width || !meta.height)
    throw new MediaRejected('invalid', 'The image could not be read');
  const frameHeight = meta.pageHeight ?? meta.height;
  if (meta.width * frameHeight > opts.maxPixels)
    throw new MediaRejected(
      'too_many_pixels',
      `The image is larger than ${Math.round(opts.maxPixels / 1e6)} megapixels`,
    );

  const rotated = (meta.orientation ?? 1) >= 5;
  const w = rotated ? frameHeight : meta.width;
  const h = rotated ? meta.width : frameHeight;
  const scale = Math.min(1, opts.maxEdge / Math.max(w, h));
  const outPixels = Math.round(w * scale) * Math.round(h * scale);
  const lossless = declared === 'png' && meta.hasAlpha === true && outPixels <= LOSSLESS_MAX_PIXELS;

  let data: Buffer;
  let info: OutputInfo;
  try {
    ({ data, info } = await sharp(input, { ...decode, pages: 1, page: 0 })
      .rotate()
      .resize({ width: opts.maxEdge, height: opts.maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp(lossless ? { lossless: true, effort: 4 } : { quality: WEBP_QUALITY, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true }));
  } catch (err) {
    if (isPixelLimit(err)) throw new MediaRejected('too_many_pixels', 'The image has too many pixels');
    throw new MediaRejected('invalid', 'The image could not be decoded');
  }

  const [digest, thumbhash] = await Promise.all([webcrypto.subtle.digest('SHA-256', data), thumbHashOf(data)]);
  return {
    id: Buffer.from(digest).toString('hex'),
    data,
    width: info.width,
    height: info.height,
    thumbhash,
    animated: (meta.pages ?? 1) > 1,
    lossless,
  };
}

/** ThumbHash of a <= 100x100 RGBA version, base64. */
export async function thumbHashOf(master: Buffer): Promise<string> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(master)
    .resize({ width: 100, height: 100, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64');
}

/** Bounds concurrent work: `max` run at once, `queue` may wait; beyond that `run` throws GateFull at once. */
export class Gate {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly max: number;
  private readonly queue: number;

  constructor(max: number, queue: number) {
    this.max = max;
    this.queue = queue;
  }

  get stats() {
    return { running: this.running, waiting: this.waiting.length };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      if (this.waiting.length >= this.queue) throw new GateFull();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running += 1;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }
}

export class GateFull extends Error {
  constructor() {
    super('too many uploads in progress');
  }
}
