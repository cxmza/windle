import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createHttp } from './api';

const parser = {
  safeParse: (input: unknown) =>
    typeof input === 'object' && input !== null && 'ok' in input
      ? ({ success: true, data: input } as const)
      : ({ success: false } as const),
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createHttp', () => {
  it('sends the session cookie on reads and keeps the url as given', async () => {
    const fetchMock = vi.fn(async () => json({ ok: 1 }));
    const http = createHttp('https://api.test', fetchMock);
    await expect(http.get('/v1/markets?status=open', parser)).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/markets?status=open');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('posts JSON with credentials', async () => {
    const fetchMock = vi.fn(async () => json({ ok: 1 }));
    const http = createHttp('https://api.test', fetchMock);
    await http.post('/v1/markets/a/trades', { action: 'buy', amountPts: 5 }, parser);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"action":"buy","amountPts":5}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('turns an error envelope into an ApiRequestError with code and details', async () => {
    const http = createHttp(
      'https://api.test',
      vi.fn(async () =>
        json({ error: { code: 'duplicate_tweet', message: 'exists', details: { existingSlug: 'taken', n: 3 } } }, 409),
      ),
    );
    const error = await http.post('/v1/markets', {}, parser).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      kind: 'http',
      status: 409,
      code: 'duplicate_tweet',
      message: 'exists',
      details: { existingSlug: 'taken' },
    });
  });

  it('reports a body that breaks the contract as a schema problem', async () => {
    const http = createHttp(
      'https://api.test',
      vi.fn(async () => json({ nope: true })),
    );
    await expect(http.get('/x', parser)).rejects.toMatchObject({ kind: 'schema', status: 200 });
  });

  it('reports no answer as a network problem and lets an abort through untouched', async () => {
    const down = createHttp(
      'https://api.test',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(down.get('/x', parser)).rejects.toMatchObject({ kind: 'network' });

    const abort = new DOMException('aborted', 'AbortError');
    const aborted = createHttp(
      'https://api.test',
      vi.fn(async () => {
        throw abort;
      }),
    );
    await expect(aborted.get('/x', parser)).rejects.toBe(abort);
  });
});
