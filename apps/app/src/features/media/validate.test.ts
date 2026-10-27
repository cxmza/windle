import { MEDIA_MAX_UPLOAD_BYTES } from '@windle/shared';
import { describe, expect, it } from 'vitest';
import { pngBytes, pngFile } from './test-support';
import { formatBytes, inspectFile } from './validate';

const problemOf = async (file: Blob) => {
  const r = await inspectFile(file);
  if (r.ok) throw new Error('expected a problem');
  return r.problem;
};

describe('inspectFile', () => {
  it('accepts a PNG and reports its size from the header', async () => {
    expect(await inspectFile(pngFile('a.png', 640, 480))).toEqual({
      ok: true,
      info: { type: 'image/png', width: 640, height: 480 },
    });
  });

  it('trusts the bytes, not the name or the declared type', async () => {
    const disguised = new File([Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3])], 'cat.png', {
      type: 'image/png',
    });
    expect(await problemOf(disguised)).toEqual({
      code: 'type',
      message: 'Use a JPG, PNG or WebP image. Other formats, such as GIF or HEIC, are not supported.',
    });
    const honest = new File([pngBytes(200, 200)], 'photo.bin', { type: '' });
    expect((await inspectFile(honest)).ok).toBe(true);
  });

  it('names the size when a file is over the limit', async () => {
    const big = new File([pngBytes(400, 400, MEDIA_MAX_UPLOAD_BYTES + 1)], 'big.png', { type: 'image/png' });
    expect(await problemOf(big)).toEqual({
      code: 'too_large',
      message: 'That file is 10.1 MB. The limit is 10 MB. Export it smaller and try again.',
    });
  });

  it('refuses an empty file', async () => {
    expect((await problemOf(new File([], 'x.png'))).code).toBe('empty');
  });

  it('refuses images that are too small or have too many pixels, with the numbers', async () => {
    expect(await problemOf(pngFile('s.png', 32, 600))).toEqual({
      code: 'too_small',
      message: 'That image is 32×600. Use one at least 64×64 pixels.',
    });
    expect(await problemOf(pngFile('h.png', 8000, 6000))).toEqual({
      code: 'too_many_pixels',
      message: 'That image is 8000×6000, over the 40 megapixel limit. Resize it and try again.',
    });
  });

  it('lets an image through when its header size cannot be read; the server checks it', async () => {
    const r = await inspectFile(new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 2])], 'j.jpg'));
    expect(r).toEqual({ ok: true, info: { type: 'image/jpeg' } });
  });
});

describe('formatBytes', () => {
  it('uses KB below a megabyte and MB above', () => {
    expect(formatBytes(300)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });
});
