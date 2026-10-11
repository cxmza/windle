import { describe, expect, it } from 'vitest';
import { MemoryEphemeralStore, MemoryUserRepository } from '../store/memory.ts';
import {
  APP_ORIGIN,
  AUTH_ORIGIN,
  getNonce,
  makeTestApp,
  newWallet,
  signIn,
  signVerifyBody,
  siwsText,
  verify,
} from '../test/helpers.ts';
import { checkMessageAgainstIssued } from './siws.ts';

describe('SIWS nonce', () => {
  it('issues the full SignInInput, stored server-side for 5 minutes', async () => {
    const { app } = makeTestApp();
    const { nonce, input } = await getNonce(app);
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(input).toEqual({
      domain: 'oauth.windle.fun',
      statement: 'Sign in to windle',
      uri: 'https://oauth.windle.fun',
      version: '1',
      chainId: 'mainnet',
      nonce,
      issuedAt: '2026-10-11T12:00:00.000Z',
      expirationTime: '2026-10-11T12:05:00.000Z',
    });
    const post = await app.inject({ method: 'POST', url: '/v1/auth/siws/nonce', headers: { origin: AUTH_ORIGIN } });
    expect(post.statusCode).toBe(200);
    expect(post.json().nonce).not.toBe(nonce);
    expect(post.headers['cache-control']).toBe('no-store');
  });
});

describe('SIWS verify', () => {
  it('signs in with a real ed25519 keypair and a real SIWS message', async () => {
    const { app, repo } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce), {
      'x-real-ip': '203.0.113.7',
      'user-agent': 'vitest',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session).toMatchObject({ authenticated: true, address: wallet.address });
    expect(body.session.expiresAt).toBe('2026-11-10T12:00:00.000Z');
    expect(body.me.wallets).toEqual([
      { chain: 'solana', address: wallet.address, linkedAt: '2026-10-11T12:00:00.000Z' },
    ]);
    expect(body.me.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const cookie = res.cookies.find((c) => c.name === 'wl_session');
    expect(cookie).toMatchObject({
      domain: '.windle.fun',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 3600,
    });
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const audit = (repo as MemoryUserRepository).audit;
    expect(audit).toHaveLength(1);
    // Trusted hop (inject comes from 127.0.0.1) -> X-Real-IP is the client. The raw token is never stored.
    expect(audit[0]).toMatchObject({ ip: '203.0.113.7', userAgent: 'vitest', method: 'siws', revokedAt: null });
    expect(audit[0]?.sessionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(audit[0]?.sessionHash).not.toBe(cookie?.value);
  });

  it('reuses the same user for the same wallet', async () => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const first = await signIn(app, wallet);
    const second = await signIn(app, wallet);
    expect(second.res.json().me.id).toBe(first.res.json().me.id);
  });

  it('rejects a replayed nonce', async () => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const body = signVerifyBody(wallet, siwsText(input, wallet.address), nonce);
    expect((await verify(app, body)).statusCode).toBe(200);
    const replay = await verify(app, body);
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('nonce_invalid');
  });

  it('rejects a nonce the api never issued', async () => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const { input } = await getNonce(app);
    const forged = { ...input, nonce: 'deadbeefdeadbeef' };
    const res = await verify(app, signVerifyBody(wallet, siwsText(forged, wallet.address), forged.nonce));
    expect(res.json().error.code).toBe('nonce_invalid');
  });

  it('rejects a message signed for another domain (phishing site relaying our nonce)', async () => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const text = siwsText(input, wallet.address, { domain: 'oauth.windle.fun.evil.com' });
    const res = await verify(app, signVerifyBody(wallet, text, nonce));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('siws_message_mismatch');
  });

  it.each([
    ['uri', { uri: 'https://evil.com' }],
    ['statement', { statement: 'Approve transfer' }],
    ['chainId', { chainId: 'devnet' as const }],
    ['expirationTime', { expirationTime: '2027-01-01T00:00:00.000Z' }],
  ])('rejects a tampered %s', async (_, overrides) => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address, overrides), nonce));
    expect(res.json().error.code).toBe('siws_message_mismatch');
  });

  it('rejects an expired sign-in request', async () => {
    // Store clock frozen at issue time (nonce still in Redis), api clock 6 minutes later: the api's own
    // expirationTime check must catch it, independently of the Redis TTL.
    const clock = { now: Date.parse('2026-10-11T12:00:00.000Z') };
    const frozen = clock.now;
    const { app } = makeTestApp({ clock, store: new MemoryEphemeralStore(() => frozen) });
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    clock.now += 6 * 60 * 1000;
    const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('siws_expired');
  });

  it('forgets the nonce once its TTL passes', async () => {
    const { app, clock } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    clock.now += 5 * 60 * 1000 + 1;
    const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce));
    expect(res.json().error.code).toBe('nonce_invalid');
  });

  it('rejects a signature from a different key', async () => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce, newWallet()));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('signature_invalid');
  });

  it('rejects a signature over different bytes', async () => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const good = signVerifyBody(wallet, siwsText(input, wallet.address), nonce);
    const other = signVerifyBody(wallet, `${siwsText(input, wallet.address)} `, nonce);
    const res = await verify(app, { ...good, signature: other.signature });
    expect(res.json().error.code).toBe('signature_invalid');
  });

  it('rejects a body whose address differs from the signed one', async () => {
    const { app } = makeTestApp();
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const body = signVerifyBody(wallet, siwsText(input, wallet.address), nonce);
    const res = await verify(app, { ...body, address: newWallet().address });
    expect(res.json().error.code).toBe('siws_message_mismatch');
  });

  it('validates the body shape', async () => {
    const { app } = makeTestApp();
    const res = await verify(app, { nonce: 'x' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_failed');
  });

  it('answers 503 (not 500) when Redis is down', async () => {
    const store = new MemoryEphemeralStore();
    const { app } = makeTestApp({ store });
    store.failing = true;
    const res = await app.inject({ method: 'GET', url: '/v1/auth/siws/nonce' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('service_unavailable');
    expect(res.headers['retry-after']).toBe('5');
  });

  it('answers 503 when Postgres is down at sign-in', async () => {
    const repo = new MemoryUserRepository();
    const { app } = makeTestApp({ repo });
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    repo.failing = true;
    const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce));
    expect(res.statusCode).toBe(503);
  });
});

describe('unit: checkMessageAgainstIssued', () => {
  const issued = {
    domain: 'oauth.windle.fun',
    statement: 'Sign in to windle',
    uri: 'https://oauth.windle.fun',
    version: '1' as const,
    chainId: 'mainnet' as const,
    nonce: 'abcdef0123456789',
    issuedAt: '2026-10-11T12:00:00.000Z',
    expirationTime: '2026-10-11T12:05:00.000Z',
  };
  const fields = { ...issued, address: 'A'.repeat(44) };

  it('tolerates wallet-added Request ID / Resources and a solana:-prefixed chain id', () => {
    const at = new Date(issued.issuedAt);
    const extra = { ...fields, requestId: 'r1', resources: ['https://x'], chainId: 'solana:mainnet' };
    expect(checkMessageAgainstIssued(extra, issued, fields.address, at)).toBeNull();
  });

  it('enforces a wallet-added Not Before', () => {
    const at = new Date(issued.issuedAt);
    const later = { ...fields, notBefore: '2026-10-11T12:04:00.000Z' };
    expect(checkMessageAgainstIssued(later, issued, fields.address, at)?.code).toBe('siws_message_mismatch');
  });

  it('rejects at exactly expirationTime', () => {
    expect(checkMessageAgainstIssued(fields, issued, fields.address, new Date(issued.expirationTime))?.code).toBe(
      'siws_expired',
    );
  });
});

describe('session', () => {
  it('is anonymous without a cookie (200, not 401)', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/v1/auth/session' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: false });
  });

  it('resolves the cookie, slides the expiry and serves /v1/me', async () => {
    const { app, clock } = makeTestApp();
    const { token, wallet } = await signIn(app);
    clock.now += 29 * 24 * 3600 * 1000;

    const s = await app.inject({ method: 'GET', url: '/v1/auth/session', cookies: { wl_session: token } });
    expect(s.json()).toMatchObject({ authenticated: true, address: wallet.address });
    expect(s.cookies.find((c) => c.name === 'wl_session')?.maxAge).toBe(30 * 24 * 3600);

    // 29 more days: alive only because the previous call renewed it.
    clock.now += 29 * 24 * 3600 * 1000;
    const me = await app.inject({ method: 'GET', url: '/v1/me', cookies: { wl_session: token } });
    expect(me.statusCode).toBe(200);
    expect(me.json().wallets[0].address).toBe(wallet.address);
  });

  it('expires after 30 idle days and clears the stale cookie', async () => {
    const { app, clock } = makeTestApp();
    const { token } = await signIn(app);
    clock.now += 30 * 24 * 3600 * 1000 + 1000;
    const res = await app.inject({ method: 'GET', url: '/v1/auth/session', cookies: { wl_session: token } });
    expect(res.json()).toEqual({ authenticated: false });
    expect(res.cookies.find((c) => c.name === 'wl_session')?.maxAge).toBe(0);
  });

  it('never outlives the absolute TTL, however active', async () => {
    const { app, clock } = makeTestApp({ env: { SESSION_ABSOLUTE_TTL_SECONDS: String(40 * 24 * 3600) } });
    const { token } = await signIn(app);
    clock.now += 20 * 24 * 3600 * 1000;
    const mid = await app.inject({ method: 'GET', url: '/v1/auth/session', cookies: { wl_session: token } });
    expect(mid.json().expiresAt).toBe(new Date(Date.parse('2026-10-11T12:00:00.000Z') + 40 * 86400_000).toISOString());
    clock.now += 20 * 24 * 3600 * 1000;
    const after = await app.inject({ method: 'GET', url: '/v1/auth/session', cookies: { wl_session: token } });
    expect(after.json()).toEqual({ authenticated: false });
  });

  it('/v1/me is 401 without a session', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
  });

  it('logout revokes the session, clears the cookie and closes the audit row', async () => {
    const { app, repo } = makeTestApp();
    const { token } = await signIn(app);
    const out = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: APP_ORIGIN },
      cookies: { wl_session: token },
    });
    expect(out.statusCode).toBe(204);
    expect(out.body).toBe('');
    const cleared = out.cookies.find((c) => c.name === 'wl_session');
    expect(cleared).toMatchObject({ value: '', domain: '.windle.fun', path: '/', maxAge: 0 });
    expect((repo as MemoryUserRepository).audit[0]).toMatchObject({ revokeReason: 'logout' });

    const after = await app.inject({ method: 'GET', url: '/v1/auth/session', cookies: { wl_session: token } });
    expect(after.json()).toEqual({ authenticated: false });

    const again = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { origin: APP_ORIGIN } });
    expect(again.statusCode).toBe(204);
  });

  it('a new sign-in replaces the session the browser already had', async () => {
    const { app, store } = makeTestApp();
    const wallet = newWallet();
    const { token } = await signIn(app, wallet);
    const { nonce, input } = await getNonce(app);
    const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce), {
      cookie: `wl_session=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect((store as MemoryEphemeralStore).sessionCount).toBe(1);
  });
});

describe('providers', () => {
  it('lists SIWS as the only enabled provider', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/v1/auth/providers' });
    expect(res.json().providers).toEqual([
      { id: 'siws', enabled: true },
      { id: 'email', enabled: false },
      { id: 'x', enabled: false },
      { id: 'google', enabled: false },
      { id: 'telegram', enabled: false },
      { id: 'discord', enabled: false },
    ]);
  });

  it.each([
    ['GET', '/v1/auth/x/start'],
    ['GET', '/v1/auth/google/start'],
    ['GET', '/v1/auth/telegram/start'],
    ['GET', '/v1/auth/telegram/callback'],
    ['GET', '/v1/auth/discord/start'],
    ['GET', '/v1/auth/discord/callback'],
    ['POST', '/v1/auth/email/start'],
  ] as const)('%s %s is 501 provider_disabled', async (method, url) => {
    const { app } = makeTestApp();
    const res = await app.inject({ method, url, headers: { origin: AUTH_ORIGIN } });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('provider_disabled');
  });

  it('refuses to enable a provider without credentials', () => {
    expect(() => makeTestApp({ env: { AUTH_X_ENABLED: 'true' } })).toThrow(/X_CLIENT_ID/);
    expect(() => makeTestApp({ env: { AUTH_TELEGRAM_ENABLED: 'true' } })).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => makeTestApp({ env: { AUTH_DISCORD_ENABLED: 'true' } })).toThrow(/DISCORD_CLIENT_ID/);
  });
});
