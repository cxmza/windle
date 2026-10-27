import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';
import { THEME_MARKER } from './reference.ts';
import { MemoryEphemeralStore, MemoryUserRepository } from './store/memory.ts';
import { APP_ORIGIN, AUTH_ORIGIN, makeTestApp, signIn } from './test/helpers.ts';

describe('config', () => {
  it('applies development defaults', () => {
    const c = loadConfig({ PORT: '4000' });
    expect(c).toMatchObject({ port: 4000, host: '127.0.0.1', env: 'development' });
    // Dev: no cookie Domain, no Secure (http://localhost), dev origins allowed.
    expect(c.cookie).toEqual({ domain: undefined, secure: false });
    expect(c.corsOrigins).toContain('http://localhost:5175');
    expect(c.siws).toMatchObject({ domain: 'localhost:5175', uri: 'http://localhost:5175' });
  });

  it('applies production defaults and requires its backing services', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL is required/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/IMGPROXY_KEY is required/);
    const c = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@postgres:5432/windle',
      REDIS_URL: 'redis://redis:6379/0',
      IMGPROXY_KEY: 'ab'.repeat(64),
      IMGPROXY_SALT: 'cd'.repeat(64),
    });
    expect(c.cookie).toEqual({ domain: '.windle.fun', secure: true });
    expect(c.corsOrigins).not.toContain('http://localhost:5175');
    expect(c.siws).toMatchObject({ domain: 'oauth.windle.fun', uri: 'https://oauth.windle.fun', chainId: 'mainnet' });
    expect(c.trustProxy).toEqual(['127.0.0.1', '::1', '172.16.0.0/12']);
    expect(c.media).toMatchObject({
      root: '/srv/windle/media',
      cdnOrigin: 'https://cdn.windle.fun',
      urlFormat: 'webp',
    });
  });

  it('accepts the infra env file names', () => {
    const c = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://windle_app:x@postgres:5432/windle',
      DATABASE_MIGRATION_URL: 'postgres://windle_owner:y@postgres:5432/windle',
      REDIS_URL: 'redis://:pw@redis:6379/0',
      REDIS_RATE_LIMIT_URL: 'redis://:pw@redis:6379/1',
      TRUST_PROXY: '127.0.0.1,172.16.0.0/12',
      COOKIE_SECRET: 'a'.repeat(64),
      SESSION_COOKIE_NAME: 'wl_session',
      SESSION_COOKIE_DOMAIN: '.windle.fun',
      SESSION_TTL_SECONDS: '2592000',
      PUBLIC_AUTH_ORIGIN: 'https://oauth.windle.fun',
      CORS_ALLOWED_ORIGINS: 'https://www.windle.fun,https://app.windle.fun',
      AUTH_SIWS_ENABLED: 'true',
      AUTH_EMAIL_ENABLED: 'false',
      IMGPROXY_KEY: 'ab'.repeat(64),
      IMGPROXY_SALT: 'cd'.repeat(64),
      MEDIA_ROOT: '/srv/windle/media',
    });
    expect(c.databaseMigrationUrl).toContain('windle_owner');
    expect(c.redisRateLimitUrl).toMatch(/\/1$/);
    expect(c.providers).toEqual({ siws: true, email: false, x: false, google: false, telegram: false, discord: false });
  });

  it.each([
    [{ PORT: 'nope' }, /PORT/],
    [{ CORS_ALLOWED_ORIGINS: '*' }, /not an exact origin/],
    [{ CORS_ALLOWED_ORIGINS: 'https://app.windle.fun/' }, /not an exact origin/],
    [{ AUTH_EMAIL_ENABLED: 'maybe' }, /AUTH_EMAIL_ENABLED/],
    [{ SESSION_COOKIE_NAME: 'sid' }, /SESSION_COOKIE_NAME/],
    [{ TRUST_PROXY: 'nginx' }, /TRUST_PROXY/],
    [{ IMGPROXY_KEY: 'not-hex' }, /IMGPROXY_KEY must be hex/],
    [{ CF_ZONE_ID: 'z' }, /CF_ZONE_ID and CF_API_TOKEN/],
  ])('rejects %o', (env, pattern) => {
    expect(() => {
      const { app } = makeTestApp({ env });
      return app;
    }).toThrow(pattern);
  });
});

describe('system routes', () => {
  it('GET / is a small JSON index', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'windle-api',
      status: 'ok',
      docs: 'https://docs.windle.fun',
      reference: expect.stringMatching(/\/reference$/),
    });
  });

  it('/health answers without any dependency', async () => {
    const store = new MemoryEphemeralStore();
    const repo = new MemoryUserRepository();
    store.failing = true;
    repo.failing = true;
    const { app } = makeTestApp({ store, repo });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('/ready is 200 when Postgres and Redis answer', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ready',
      checks: { postgres: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('/ready is 503 when a dependency fails, and the process keeps serving', async () => {
    const store = new MemoryEphemeralStore();
    const { app } = makeTestApp({ store });
    store.failing = true;
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status: 'not_ready',
      checks: { postgres: { status: 'up' }, redis: { status: 'down' } },
    });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it('/ready times out a hanging dependency instead of hanging itself', async () => {
    const repo = new MemoryUserRepository();
    repo.ping = () => new Promise(() => {});
    const { app } = makeTestApp({ repo });
    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.postgres.status).toBe('down');
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('serves the OpenAPI document and the reference UI', async () => {
    const { app } = makeTestApp();
    const spec = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(spec.statusCode).toBe(200);
    const doc = spec.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/v1/auth/siws/nonce', '/v1/auth/siws/verify', '/v1/auth/session', '/v1/me']),
    );
    expect(doc.paths['/metrics']).toBeUndefined();

    const redirect = await app.inject({ method: 'GET', url: '/reference' });
    expect(redirect.statusCode).toBe(301);
    const ui = await app.inject({ method: 'GET', url: '/reference/' });
    expect(ui.statusCode).toBe(200);
    expect(ui.body).toContain('<script src="js/scalar.js">');
    expect(ui.headers['content-type']).toMatch(/text\/html/);
    expect(ui.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('ships the windle reference theme and keeps /reference self-contained (no third-party origins)', async () => {
    const { app } = makeTestApp();
    const ui = await app.inject({ method: 'GET', url: '/reference/' });
    expect(ui.statusCode).toBe(200);
    expect(ui.body).toContain(THEME_MARKER);
    const csp = String(ui.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/https?:/);
    expect(ui.body).not.toContain('fonts.googleapis.com');
  });
});

describe('errors', () => {
  it('answers unknown routes with the shared ApiError shape', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/nope?x=1', headers: { 'x-request-id': 'req-123' } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'GET /nope not found', requestId: 'req-123' } });
  });

  it('never exposes internal error messages in production', async () => {
    const { app } = makeTestApp({
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://x@y/z',
        REDIS_URL: 'redis://y',
        IMGPROXY_KEY: 'ab',
        IMGPROXY_SALT: 'cd',
      },
    });
    app.get('/boom', async () => {
      throw new Error('secret driver detail at /srv/app.js:42');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatchObject({ code: 'internal_error', message: 'Internal server error' });
    expect(res.body).not.toContain('secret');
    expect(res.body).not.toContain('stack');
  });

  it('rejects bodies over the limit with 413', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/siws/verify',
      headers: { origin: AUTH_ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({ pad: 'x'.repeat(20_000) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('payload_too_large');
  });

  it('rejects malformed JSON with 400 invalid_json', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/siws/verify',
      headers: { origin: AUTH_ORIGIN, 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_json');
  });
});

describe('request ids', () => {
  it('passes a well-formed X-Request-Id through and replaces a bad one', async () => {
    const { app } = makeTestApp();
    const ok = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'abc-123' } });
    expect(ok.headers['x-request-id']).toBe('abc-123');
    const bad = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'a b\u0000c' } });
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('security headers', () => {
  it('sends an API-strict CSP and no-store on JSON responses', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/v1/auth/session' });
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('answers a credentialed preflight from an allowed origin', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/auth/siws/verify',
      headers: {
        origin: AUTH_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(AUTH_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('content-type');
  });

  it('gives a foreign origin no CORS grant', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const sub = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { origin: 'https://evil.windle.fun' },
    });
    expect(sub.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CSRF', () => {
  it('rejects a state-changing request from a foreign Origin', async () => {
    const { app } = makeTestApp();
    const { token } = await signIn(app);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: 'https://evil.example' },
      cookies: { wl_session: token },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('csrf_rejected');
    // The session survived.
    const s = await app.inject({ method: 'GET', url: '/v1/auth/session', cookies: { wl_session: token } });
    expect(s.json().authenticated).toBe(true);
  });

  it('rejects a non-allow-listed sibling subdomain (SameSite=Lax alone would let it through)', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: 'https://user-content.windle.fun' },
    });
    expect(res.json().error.code).toBe('csrf_rejected');
  });

  it('falls back to Referer, and rejects cookie requests with neither header', async () => {
    const { app } = makeTestApp();
    const { token } = await signIn(app);
    const byReferer = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { referer: 'https://evil.example/page' },
      cookies: { wl_session: token },
    });
    expect(byReferer.statusCode).toBe(403);
    const bare = await app.inject({ method: 'POST', url: '/v1/auth/logout', cookies: { wl_session: token } });
    expect(bare.statusCode).toBe(403);
    const okReferer = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { referer: `${APP_ORIGIN}/account` },
      cookies: { wl_session: token },
    });
    expect(okReferer.statusCode).toBe(204);
  });

  it('refuses text/plain bodies (no preflight-free cross-site posts)', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/siws/verify',
      headers: { origin: AUTH_ORIGIN, 'content-type': 'text/plain' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('unsupported_media_type');
  });
});

describe('rate limits', () => {
  it('limits auth endpoints per client IP and answers in the ApiError shape', async () => {
    const { app } = makeTestApp({ env: { RATE_LIMIT_AUTH_MAX: '3' } });
    const hit = (ip: string) =>
      app.inject({ method: 'GET', url: '/v1/auth/siws/nonce', headers: { origin: AUTH_ORIGIN, 'x-real-ip': ip } });
    for (let i = 0; i < 3; i++) expect((await hit('198.51.100.1')).statusCode).toBe(200);
    const limited = await hit('198.51.100.1');
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // Another visitor behind the same proxy is unaffected (key = real client IP, not the nginx hop).
    expect((await hit('198.51.100.2')).statusCode).toBe(200);
  });

  it('ignores X-Real-IP from an untrusted peer (cannot dodge the limit by spoofing)', async () => {
    const { app } = makeTestApp({ env: { RATE_LIMIT_AUTH_MAX: '2' } });
    const hit = (spoof: string) =>
      app.inject({
        method: 'GET',
        url: '/v1/auth/siws/nonce',
        remoteAddress: '203.0.113.50',
        headers: { origin: AUTH_ORIGIN, 'x-real-ip': spoof },
      });
    expect((await hit('1.1.1.1')).statusCode).toBe(200);
    expect((await hit('2.2.2.2')).statusCode).toBe(200);
    expect((await hit('3.3.3.3')).statusCode).toBe(429);
  });

  it('applies the global limit and exempts /health', async () => {
    const { app } = makeTestApp({ env: { RATE_LIMIT_MAX: '2' } });
    for (let i = 0; i < 2; i++) expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(429);
    for (let i = 0; i < 5; i++) expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});

describe('/metrics', () => {
  it('serves Prometheus text to a direct internal request', async () => {
    const { app } = makeTestApp();
    await app.inject({ method: 'GET', url: '/health' });
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(res.body).toContain('windle_http_requests_total{method="GET",route="/health",status="200"} 1');
    expect(res.body).toContain('windle_http_request_duration_seconds_bucket{method="GET",route="/health",le="+Inf"} 1');
    expect(res.body).toContain('windle_dependency_up{dependency="postgres"} 1');
  });

  it('is a 404 for anything relayed by the edge proxy or from outside', async () => {
    const { app } = makeTestApp();
    const relayed = await app.inject({ method: 'GET', url: '/metrics', headers: { 'x-real-ip': '203.0.113.7' } });
    expect(relayed.statusCode).toBe(404);
    const outside = await app.inject({ method: 'GET', url: '/metrics', remoteAddress: '203.0.113.7' });
    expect(outside.statusCode).toBe(404);
  });

  it('accepts the bearer token from anywhere', async () => {
    const token = 'm'.repeat(40);
    const { app } = makeTestApp({ env: { METRICS_TOKEN: token } });
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-real-ip': '203.0.113.7', authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const wrong = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-real-ip': '203.0.113.7', authorization: 'Bearer nope' },
    });
    expect(wrong.statusCode).toBe(404);
  });
});
