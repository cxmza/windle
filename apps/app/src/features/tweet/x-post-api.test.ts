import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerTime, serverOffset } from '@/lib/server-time';
import { xpost } from './fixtures';
import { clearXPostCache, loadXPost } from './x-post-api';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const BASE = 'http://api.test';
const errorBody = (code: string) => ({ error: { code, message: code } });

beforeEach(() => {
  clearXPostCache();
  resetServerTime();
});
afterEach(() => vi.unstubAllGlobals());

const urlOf = (mock: ReturnType<typeof vi.fn>, i = 0) => String((mock.mock.calls[i] as unknown[])[0]);

describe('loadXPost', () => {
  it('asks for enrichment and reports an enriched post', async () => {
    const post = xpost({ enrichedAt: '2026-10-13T11:59:58.000Z' });
    const fetchMock = vi.fn(async () => json(post));
    vi.stubGlobal('fetch', fetchMock);
    const res = await loadXPost(post.id, true, BASE);
    expect(urlOf(fetchMock)).toBe(`${BASE}/v1/x/post/${post.id}?enrich=1`);
    expect(res).toMatchObject({ status: 'ok', enriched: true, degraded: false });
  });

  it('does not ask for enrichment of a live row', async () => {
    const fetchMock = vi.fn(async () => json(xpost({ source: 'gmgn' })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await loadXPost('1846811200000000100', false, BASE);
    expect(urlOf(fetchMock)).toBe(`${BASE}/v1/x/post/1846811200000000100`);
    expect(res).toMatchObject({ status: 'ok', enriched: false });
  });

  it('shares one request between concurrent callers and reuses a good answer', async () => {
    const fetchMock = vi.fn(async () => json(xpost()));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([
      loadXPost('1846811200000000100', true, BASE),
      loadXPost('1846811200000000100', true, BASE),
    ]);
    await loadXPost('1846811200000000100', true, BASE);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps 404, 429 and 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(errorBody('x_post_not_found'), 404)),
    );
    expect(await loadXPost('1', true, BASE)).toEqual({ status: 'not_found' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(errorBody('rate_limited'), 429, { 'retry-after': '7' })),
    );
    expect(await loadXPost('2', true, BASE)).toEqual({ status: 'rate_limited', retryAfterMs: 7000 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(errorBody('x_feed_unavailable'), 503)),
    );
    expect(await loadXPost('3', true, BASE)).toEqual({ status: 'unavailable' });
  });

  it('falls back to the relay copy, marked degraded, when enrichment is unavailable', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('?enrich=1') ? json(errorBody('x_enrich_unavailable'), 503) : json(xpost({ source: 'gmgn' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await loadXPost('1846811200000000100', true, BASE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ status: 'ok', enriched: false, degraded: true });
  });

  it('reports offline when the api cannot be reached, and rejects a body that is not a post', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('down');
      }),
    );
    expect(await loadXPost('1', true, BASE)).toEqual({ status: 'offline' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ nope: true })),
    );
    expect(await loadXPost('2', true, BASE)).toEqual({ status: 'unavailable' });
  });

  it('learns the server time from the Date header', async () => {
    const date = new Date(Date.now() + 40_000).toUTCString();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(xpost(), 200, { date })),
    );
    await loadXPost('1846811200000000100', true, BASE);
    expect(serverOffset()).toBeGreaterThan(35_000);
  });
});
