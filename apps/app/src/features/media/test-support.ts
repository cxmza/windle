import type { ApiImage } from '@windle/shared';
import { rgbaToThumbHash } from 'thumbhash';
import { vi } from 'vitest';

const HASH = (() => {
  const rgba = new Uint8Array(4 * 4 * 4).fill(160);
  return btoa(String.fromCharCode(...rgbaToThumbHash(4, 4, rgba)));
})();

export const hex = (n: number): string => n.toString(16).padStart(64, '0');

const CDN = 'https://cdn.windle.fun/img';

/** An uploaded image as the api returns it, with a real ThumbHash and one URL per preset. */
export function makeImage(n = 1, over: Partial<ApiImage> = {}): ApiImage {
  const id = hex(n);
  return {
    id,
    width: 800,
    height: 600,
    thumbhash: HASH,
    urls: {
      avatar64: `${CDN}/${id}/avatar64.webp`,
      avatar128: `${CDN}/${id}/avatar128.webp`,
      thumb: `${CDN}/${id}/thumb.webp`,
      card: `${CDN}/${id}/card.webp`,
      cover: `${CDN}/${id}/cover.webp`,
      og: `${CDN}/${id}/og.jpg`,
    },
    ...over,
  };
}

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** The first bytes of a PNG with the given size in its header, padded with zeros to `bytes` in total. */
export function pngBytes(width = 400, height = 400, bytes = 64): Uint8Array<ArrayBuffer> {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
  const out = new Uint8Array(Math.max(bytes, 33));
  out.set([...head, ...u32(width), ...u32(height)]);
  return out;
}

export const pngFile = (name = 'logo.png', width = 400, height = 400, bytes = 64): File =>
  new File([pngBytes(width, height, bytes)], name, { type: 'image/png' });

/** The stand-in for XMLHttpRequest: tests drive progress and the answer by hand. */
export class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  withCredentials = false;
  responseType = '';
  timeout = 0;
  status = 0;
  responseText = '';
  body: unknown = null;
  aborted = false;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: unknown): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }

  respond(status: number, body: unknown): void {
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.onload?.();
  }

  fail(): void {
    this.onerror?.();
  }

  static install(): typeof FakeXhr {
    FakeXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    return FakeXhr;
  }

  static get last(): FakeXhr {
    const x = FakeXhr.instances.at(-1);
    if (!x) throw new Error('no upload was started');
    return x;
  }
}

/** jsdom has no object URLs; hand out predictable ones and count what is revoked. */
export function stubObjectUrls() {
  let n = 0;
  const create = vi.fn(() => `blob:preview-${++n}`);
  const revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: create });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revoke });
  return { create, revoke };
}
