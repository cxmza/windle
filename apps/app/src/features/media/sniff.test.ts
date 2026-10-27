import { describe, expect, it } from 'vitest';
import { readHeaderSize, sniffImageType } from './sniff';
import { pngBytes } from './test-support';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function webp(chunk: string, body: number[]): Uint8Array {
  return Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(chunk), 0, 0, 0, 0, ...body]);
}

describe('sniffImageType', () => {
  it('knows the three accepted formats by their magic bytes', () => {
    expect(sniffImageType(pngBytes())).toBe('image/png');
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBe('image/jpeg');
    expect(sniffImageType(webp('VP8X', []))).toBe('image/webp');
  });

  it('refuses everything else, whatever the file is called', () => {
    expect(sniffImageType(Uint8Array.from(ascii('GIF89a......')))).toBeNull();
    expect(sniffImageType(Uint8Array.from(ascii('<svg xmlns=')))).toBeNull();
    expect(sniffImageType(Uint8Array.from(ascii('RIFF....WAVEfmt ')))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});

describe('readHeaderSize', () => {
  it('reads a PNG header', () => {
    expect(readHeaderSize(pngBytes(1280, 720), 'image/png')).toEqual({ width: 1280, height: 720 });
  });

  it('reads the frame size of a JPEG past other segments', () => {
    const app0 = [0xff, 0xe0, 0, 6, 1, 2, 3, 4];
    const sof = [0xff, 0xc0, 0, 17, 8, 0x02, 0x58, 0x03, 0x20, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
    const jpeg = Uint8Array.from([0xff, 0xd8, ...app0, ...sof]);
    expect(readHeaderSize(jpeg, 'image/jpeg')).toEqual({ width: 800, height: 600 });
  });

  it('reads extended and lossless WebP', () => {
    const vp8x = webp('VP8X', [0, 0, 0, 0, 0x1f, 0x03, 0, 0x8f, 0x01, 0]);
    expect(readHeaderSize(vp8x, 'image/webp')).toEqual({ width: 800, height: 400 });
    // VP8L: signature 0x2f, then 14 bits of width-1 and 14 bits of height-1
    const bits = (100 - 1) | ((50 - 1) << 14);
    const vp8l = webp('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255]);
    expect(readHeaderSize(vp8l, 'image/webp')).toEqual({ width: 100, height: 50 });
  });

  it('gives up quietly on a cut-off header', () => {
    expect(readHeaderSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBeNull();
    expect(readHeaderSize(pngBytes().slice(0, 10), 'image/png')).toBeNull();
  });
});
