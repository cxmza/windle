import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { FakeXhr, makeImage } from './test-support';
import { canRetry, isAbort, mediaErrorMessage, uploadErrorMessage, uploadImage } from './upload';

const BASE = 'https://api.test';
const blob = new Blob([new Uint8Array(10)], { type: 'image/png' });

beforeEach(() => {
  FakeXhr.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const apiError = (code: string) => ({ error: { code, message: code } });

describe('uploadImage', () => {
  it('posts the raw bytes with the session cookie and the declared type', () => {
    void uploadImage(blob, 'image/png', { kind: 'avatar', baseUrl: BASE }).catch(() => {});
    const xhr = FakeXhr.last;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(`${BASE}/v1/media?kind=avatar`);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers['Content-Type']).toBe('image/png');
    expect(xhr.body).toBe(blob);
  });

  it('reports real upload progress as a fraction', () => {
    const seen: number[] = [];
    void uploadImage(blob, 'image/png', { kind: 'market', baseUrl: BASE, onProgress: (f) => seen.push(f) }).catch(
      () => {},
    );
    FakeXhr.last.progress(25, 100);
    FakeXhr.last.progress(100, 100);
    expect(seen).toEqual([0.25, 1]);
  });

  it('resolves with the validated image on 201 and on 200', async () => {
    const image = makeImage(3);
    const first = uploadImage(blob, 'image/png', { kind: 'market', baseUrl: BASE });
    FakeXhr.last.respond(201, { image, created: true });
    expect(await first).toEqual({ image, created: true });
    const again = uploadImage(blob, 'image/png', { kind: 'market', baseUrl: BASE });
    FakeXhr.last.respond(200, { image, created: false });
    expect((await again).created).toBe(false);
  });

  it('rejects an answer that is not the contract', async () => {
    const p = uploadImage(blob, 'image/png', { kind: 'market', baseUrl: BASE });
    FakeXhr.last.respond(201, { image: { id: 'nope' }, created: true });
    await expect(p).rejects.toMatchObject({ kind: 'schema' });
  });

  it('rejects with the status and code the api sent', async () => {
    const p = uploadImage(blob, 'image/png', { kind: 'market', baseUrl: BASE });
    FakeXhr.last.respond(422, apiError('media_invalid'));
    await expect(p).rejects.toMatchObject({ kind: 'http', status: 422, code: 'media_invalid' });
  });

  it('rejects as a network error when the connection fails', async () => {
    const p = uploadImage(blob, 'image/png', { kind: 'market', baseUrl: BASE });
    FakeXhr.last.fail();
    await expect(p).rejects.toMatchObject({ kind: 'network' });
  });

  it('aborts the request when the signal fires, and never starts when already aborted', async () => {
    const controller = new AbortController();
    const p = uploadImage(blob, 'image/png', { kind: 'market', baseUrl: BASE, signal: controller.signal });
    controller.abort();
    expect(FakeXhr.last.aborted).toBe(true);
    const error = await p.catch((e: unknown) => e);
    expect(isAbort(error)).toBe(true);

    const before = FakeXhr.instances.length;
    const done = await uploadImage(blob, 'image/png', {
      kind: 'market',
      baseUrl: BASE,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(isAbort(done)).toBe(true);
    expect(FakeXhr.instances.length).toBe(before);
  });
});

describe('upload error copy', () => {
  const http = (status: number, code: string | null) => new ApiRequestError('http', 'x', status, code);

  it.each([
    [401, 'unauthenticated', 'Your session ended. Sign in again, then upload the image.'],
    [403, 'csrf_rejected', 'The browser request was blocked for safety. Reload the page and try again.'],
    [413, 'payload_too_large', 'That file is too large. The limit is 10 MB.'],
    [415, 'unsupported_media_type', 'Use a JPG, PNG or WebP image.'],
    [415, 'media_type_mismatch', 'The file contents do not match its type. Export it again as JPG, PNG or WebP.'],
    [422, 'media_invalid', 'We could not read that image. Try another file, or export it again.'],
    [422, 'media_too_many_pixels', 'That image has too many pixels. Resize it below 40 megapixels and try again.'],
    [429, 'rate_limited', 'Too many requests. Wait a minute and try again.'],
    [429, 'media_quota_exceeded', 'You have reached your upload limit for now. Try again later.'],
    [410, 'media_removed', 'That image was removed by moderators and cannot be used. Choose another one.'],
    [503, 'media_busy', 'The image service is busy. Try again in a few seconds.'],
    [507, 'media_storage_full', 'Image storage is full right now. Try again later.'],
  ])('%i %s', (status, code, copy) => {
    expect(uploadErrorMessage(http(status, code))).toBe(copy);
  });

  it('falls back by status when the code is unknown, then to a generic line', () => {
    expect(uploadErrorMessage(http(503, 'whatever'))).toBe('The image service is busy. Try again in a few seconds.');
    expect(uploadErrorMessage(http(500, null))).toBe('The upload failed. Try again.');
    expect(uploadErrorMessage(new Error('boom'))).toBe('The upload failed. Try again.');
  });

  it('has its own lines for a dropped connection and a timeout', () => {
    expect(uploadErrorMessage(new ApiRequestError('network', 'x'))).toBe(
      'The connection dropped. Check it and try again.',
    );
    expect(uploadErrorMessage(new ApiRequestError('network', 'x', null, 'upload_timeout'))).toBe(
      'The upload took too long. Check your connection and try again.',
    );
  });

  it('uses the caller fallback for other media requests', () => {
    expect(mediaErrorMessage(http(500, null), 'Could not send the report.')).toBe('Could not send the report.');
  });

  it('offers a retry only where the same file could succeed', () => {
    expect(canRetry(http(503, 'media_busy'))).toBe(true);
    expect(canRetry(http(429, 'rate_limited'))).toBe(true);
    expect(canRetry(new ApiRequestError('network', 'x'))).toBe(true);
    expect(canRetry(http(422, 'media_invalid'))).toBe(false);
    expect(canRetry(http(415, 'media_type_mismatch'))).toBe(false);
    expect(canRetry(http(413, null))).toBe(false);
    expect(canRetry(http(410, 'media_removed'))).toBe(false);
  });
});
