import { describe, expect, it, vi } from 'vitest';
import { COMPRESS_ABOVE_BYTES, planCompression, prepareUpload } from './compress';

const MB = 1024 * 1024;
const png = { type: 'image/png', width: 1000, height: 800 } as const;
const blobOf = (size: number, type = 'image/png') => new Blob([new Uint8Array(size)], { type });

describe('planCompression', () => {
  it('leaves small files alone', () => {
    expect(planCompression(200 * 1024, png).compress).toBe(false);
    expect(planCompression(COMPRESS_ABOVE_BYTES, png).compress).toBe(false);
  });

  it('shrinks heavy files', () => {
    expect(planCompression(COMPRESS_ABOVE_BYTES + 1, png).compress).toBe(true);
  });

  it('shrinks anything wider than the server keeps and plans the capped size', () => {
    expect(planCompression(300 * 1024, { type: 'image/jpeg', width: 4096, height: 3072 })).toEqual({
      compress: true,
      width: 2048,
      height: 1536,
    });
  });

  it('still decides by weight when the header size is unknown', () => {
    expect(planCompression(3 * MB, { type: 'image/jpeg' })).toEqual({ compress: true, width: null, height: null });
  });
});

describe('prepareUpload', () => {
  it('uploads the encoder result when it is a smaller WebP', async () => {
    const out = blobOf(400 * 1024, 'image/webp');
    const encode = vi.fn(async () => out);
    const prepared = await prepareUpload(blobOf(4 * MB), png, encode);
    expect(prepared).toEqual({ blob: out, type: 'image/webp', compressed: true });
  });

  it('keeps the original when compression does not help', async () => {
    const original = blobOf(2 * MB);
    const bigger = await prepareUpload(original, png, async () => blobOf(3 * MB, 'image/webp'));
    expect(bigger).toEqual({ blob: original, type: 'image/png', compressed: false });
  });

  it('keeps the original when the browser cannot encode WebP or fails', async () => {
    const original = blobOf(2 * MB, 'image/jpeg');
    const info = { type: 'image/jpeg', width: 1000, height: 800 } as const;
    expect((await prepareUpload(original, info, async () => blobOf(10, 'image/png'))).compressed).toBe(false);
    expect((await prepareUpload(original, info, async () => null)).compressed).toBe(false);
    const failed = await prepareUpload(original, info, async () => {
      throw new Error('decode failed');
    });
    expect(failed).toEqual({ blob: original, type: 'image/jpeg', compressed: false });
  });

  it('does not touch the encoder for a small file', async () => {
    const encode = vi.fn(async () => blobOf(1, 'image/webp'));
    const prepared = await prepareUpload(blobOf(1000), png, encode);
    expect(encode).not.toHaveBeenCalled();
    expect(prepared.compressed).toBe(false);
  });
});
