import { describe, expect, it } from 'vitest';
import { pickVariant, pickVariants } from './pick-variant';

const variants = [
  { url: 'low.mp4', contentType: 'video/mp4', bitrate: 256_000 },
  { url: 'hi.mp4', contentType: 'video/mp4', bitrate: 2_176_000 },
  { url: 'mid.mp4', contentType: 'video/mp4', bitrate: 832_000 },
  { url: 'list.m3u8', contentType: 'application/x-mpegURL', bitrate: null },
];

describe('pickVariant', () => {
  it('takes the highest bitrate mp4', () => {
    expect(pickVariant({ url: 'x', variants }, false)).toBe('hi.mp4');
  });
  it('takes the best light one on a small screen', () => {
    expect(pickVariant({ url: 'x', variants }, true)).toBe('mid.mp4');
  });
  it('takes the lightest when all are heavy', () => {
    const heavy = variants.filter((v) => (v.bitrate ?? 0) > 1_000_000 || v.contentType !== 'video/mp4');
    expect(pickVariant({ url: 'x', variants: heavy }, true)).toBe('hi.mp4');
  });
  it('uses the media url when it is an mp4 and there are no variants', () => {
    expect(pickVariant({ url: 'https://v/x.mp4?tag=1' }, false)).toBe('https://v/x.mp4?tag=1');
  });
  it('returns null when nothing is playable', () => {
    expect(
      pickVariant({ url: 'https://v/x.m3u8', variants: [variants[3] as (typeof variants)[number]] }, false),
    ).toBeNull();
  });
});

describe('pickVariants', () => {
  it('lists the picked file first, then the others heaviest to lightest', () => {
    expect(pickVariants({ url: 'x', variants }, false)).toEqual(['hi.mp4', 'mid.mp4', 'low.mp4']);
    expect(pickVariants({ url: 'x', variants }, true)).toEqual(['mid.mp4', 'hi.mp4', 'low.mp4']);
  });
  it('is empty when nothing is playable', () => {
    expect(pickVariants({ url: 'https://v/x.m3u8' }, false)).toEqual([]);
  });
});
