import { describe, expect, it, vi } from 'vitest';
import { createAuthApi } from '@/lib/api';
import { ADDRESS, fakeWallet, json, nonceBody, verifyBody } from '@/test/fake-wallet';
import { performSiws, SignInError, type SignInFailure } from './siws';

const BASE = 'https://api.test';

function setup(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => handler(String(url), init));
  return { fetchMock, api: createAuthApi(BASE, fetchMock as unknown as typeof fetch) };
}

const happy = (url: string) => (url.endsWith('/nonce') ? json(nonceBody) : json(verifyBody));

async function failureOf(p: Promise<unknown>): Promise<SignInFailure> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(SignInError);
  return (err as SignInError).failure;
}

describe('performSiws', () => {
  it('runs nonce -> signIn -> verify and sends base64 message + base58 signature with credentials', async () => {
    const { api, fetchMock } = setup(happy);
    const { wallet, signIn } = fakeWallet();
    const steps: string[] = [];

    const res = await performSiws(wallet, { api, onStep: (s) => steps.push(s) });

    expect(steps).toEqual(['nonce', 'signature', 'verify']);
    expect(signIn).toHaveBeenCalledWith(nonceBody.input);
    const [nonceCall, verifyCall] = fetchMock.mock.calls;
    expect(String(nonceCall?.[0])).toBe(`${BASE}/v1/auth/siws/nonce`);
    expect(nonceCall?.[1]?.credentials).toBe('include');
    expect(String(verifyCall?.[0])).toBe(`${BASE}/v1/auth/siws/verify`);
    expect(verifyCall?.[1]?.method).toBe('POST');
    expect(verifyCall?.[1]?.credentials).toBe('include');
    const body = JSON.parse(String(verifyCall?.[1]?.body));
    expect(body).toMatchObject({
      nonce: nonceBody.nonce,
      address: ADDRESS,
      signedMessage: btoa('oauth.windle.fun wants you to sign in'),
    });
    expect(body.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
    expect(res.session.address).toBe(ADDRESS);
  });

  it('reports a user rejection (EIP-1193 code) as rejected, not as an error', async () => {
    const { api } = setup(happy);
    const { wallet } = fakeWallet('Phantom', async () => {
      throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
    });
    expect(await failureOf(performSiws(wallet, { api }))).toEqual({ kind: 'rejected' });
  });

  it('reports a rejection that only has a message', async () => {
    const { api } = setup(happy);
    const { wallet } = fakeWallet('Backpack', async () => {
      throw new Error('Request denied by user');
    });
    expect(await failureOf(performSiws(wallet, { api }))).toEqual({ kind: 'rejected' });
  });

  it('maps other wallet failures to an actionable wallet error', async () => {
    const { api } = setup(happy);
    const { wallet } = fakeWallet('Solflare', async () => {
      throw new Error('wallet locked');
    });
    const failure = await failureOf(performSiws(wallet, { api }));
    expect(failure.kind).toBe('wallet');
    expect(failure.kind === 'wallet' && failure.message).toMatch(/Solflare/);
  });

  it('maps an unreachable api to a network failure before the wallet is ever opened', async () => {
    const { api } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    const { wallet, signIn } = fakeWallet();
    expect((await failureOf(performSiws(wallet, { api }))).kind).toBe('network');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('maps 429, 5xx, a bad signature and a malformed body to distinct failures', async () => {
    const run = async (verify: () => Response) => {
      const { api } = setup((url) => (url.endsWith('/nonce') ? json(nonceBody) : verify()));
      return (await failureOf(performSiws(fakeWallet().wallet, { api }))).kind;
    };
    expect(await run(() => json({ error: { code: 'rate_limited', message: 'slow down' } }, 429))).toBe('rate-limited');
    expect(await run(() => json({ error: { code: 'internal', message: 'boom' } }, 503))).toBe('server');
    expect(await run(() => json({ error: { code: 'bad_signature', message: 'nope' } }, 401))).toBe('verify');
    expect(await run(() => json({ unexpected: true }))).toBe('server');
  });

  it('rejects a nonce response that breaks the contract', async () => {
    const { api } = setup(() => json({ nonce: 'x' }));
    expect((await failureOf(performSiws(fakeWallet().wallet, { api }))).kind).toBe('server');
  });
});
