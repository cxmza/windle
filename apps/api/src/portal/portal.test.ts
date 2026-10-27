import { describe, expect, it } from 'vitest';
import { prefersHtml } from '../routes/system.ts';
import { MemoryEphemeralStore, MemoryUserRepository } from '../store/memory.ts';
import { makeTestApp } from '../test/helpers.ts';
import { highlight } from './render.ts';

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

const SECRETS = {
  DATABASE_URL: 'postgres://windle_app:pg-secret-0f1e2d@postgres:5432/windle',
  REDIS_URL: 'redis://:redis-secret-9a8b7c@redis:6379/0',
  COOKIE_SECRET: 'cookie-secret-'.padEnd(64, 'x'),
  METRICS_TOKEN: 'metrics-token-'.padEnd(40, 'y'),
};

function getPortal(app: ReturnType<typeof makeTestApp>['app'], accept = BROWSER_ACCEPT) {
  return app.inject({ method: 'GET', url: '/', headers: { accept } });
}

describe('GET / content negotiation', () => {
  it.each([
    [BROWSER_ACCEPT, true],
    ['text/html', true],
    ['application/json', false],
    ['*/*', false],
    ['application/json, text/html;q=0.5', false],
    ['text/html;q=0', false],
    [undefined, false],
  ])('prefersHtml(%s) = %s', (accept, expected) => {
    expect(prefersHtml(accept)).toBe(expected);
  });

  it('keeps the exact JSON index for API clients, with Vary: Accept', async () => {
    const { app } = makeTestApp();
    for (const accept of [undefined, 'application/json', '*/*']) {
      const res = await app.inject({ method: 'GET', url: '/', headers: accept ? { accept } : {} });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(Object.keys(res.json())).toEqual(['name', 'version', 'status', 'docs', 'reference', 'openapi', 'health']);
      expect(res.headers.vary).toMatch(/\bAccept\b/);
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
    }
  });

  it('serves the portal to browsers with a nonce CSP, no-store and Vary: Accept', async () => {
    const { app } = makeTestApp();
    const res = await getPortal(app);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.vary).toMatch(/\bAccept\b/);
    const csp = String(res.headers['content-security-policy']);
    const nonce = /script-src 'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`style-src 'nonce-${nonce}'`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.body).toContain(`<script nonce="${nonce}">`);
    expect(res.body).toContain(`<style nonce="${nonce}">`);
    // Every inline script/style carries the nonce; no inline handlers or style attributes (CSP would block them).
    expect(res.body.match(/<script(?![^>]*nonce=)/g)).toBeNull();
    expect(res.body.match(/<style(?![^>]*nonce=)/g)).toBeNull();
    expect(res.body).not.toMatch(/\son[a-z]+=/i);
    expect(res.body).not.toMatch(/\sstyle="/);
    expect(res.body).toContain('<title>windle API</title>');
    expect(res.body).toContain('noindex');

    const again = await getPortal(app);
    expect(again.headers['content-security-policy']).not.toBe(csp);
  });

  it('leaks no secrets or env values into the page', async () => {
    const { app } = makeTestApp({ env: SECRETS });
    const res = await getPortal(app);
    expect(res.statusCode).toBe(200);
    for (const value of Object.values(SECRETS)) {
      expect(res.body).not.toContain(value);
    }
    for (const fragment of ['pg-secret', 'redis-secret', 'cookie-secret', 'metrics-token', 'postgres://', 'redis://']) {
      expect(res.body).not.toContain(fragment);
    }
  });

  it('does not reflect request input', async () => {
    const { app } = makeTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/?q=<script>alert(1)</script>',
      headers: { accept: BROWSER_ACCEPT, 'x-request-id': 'reflect-me-123', 'user-agent': 'ua-marker-xyz' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('alert(1)');
    expect(res.body).not.toContain('reflect-me-123');
    expect(res.body).not.toContain('ua-marker-xyz');
  });
});

describe('portal status card', () => {
  it('renders operational when Postgres and Redis answer', async () => {
    const { app } = makeTestApp();
    const res = await getPortal(app);
    expect(res.body).toContain('data-state="ok"');
    expect(res.body).toMatch(/<span data-title>Operational<\/span>/);
    expect(res.body).toMatch(/data-check="postgres"[\s\S]*?data-status="up"/);
    expect(res.body).toMatch(/data-check="redis"[\s\S]*?data-status="up"/);
  });

  it('renders degraded / outage when dependencies are down, and still answers 200', async () => {
    const store = new MemoryEphemeralStore();
    store.failing = true;
    const degraded = await getPortal(makeTestApp({ store }).app);
    expect(degraded.statusCode).toBe(200);
    expect(degraded.body).toContain('data-state="degraded"');
    expect(degraded.body).toMatch(/data-check="redis"[\s\S]*?data-status="down"/);
    expect(degraded.body).toMatch(/data-check="postgres"[\s\S]*?data-status="up"/);

    const repo = new MemoryUserRepository();
    repo.failing = true;
    const down = await getPortal(makeTestApp({ store, repo }).app);
    expect(down.body).toContain('data-state="down"');
    expect(down.body).toContain('Major outage');
  });

  it('caches the dependency probe for a few seconds', async () => {
    const repo = new MemoryUserRepository();
    let pings = 0;
    const ping = repo.ping.bind(repo);
    repo.ping = () => {
      pings++;
      return ping();
    };
    const { app } = makeTestApp({ repo });
    await Promise.all([getPortal(app), getPortal(app), getPortal(app)]);
    await getPortal(app);
    expect(pings).toBe(1);
    // /ready itself is never cached.
    await app.inject({ method: 'GET', url: '/ready' });
    expect(pings).toBe(2);
  });

  it('is a home page, not documentation: base URL, three doors, one example, no endpoint table', async () => {
    const { app } = makeTestApp();
    const body = (await getPortal(app)).body;
    expect(body).toContain('<h1 id="title">The windle API</h1>');
    expect(body).toMatch(/<code id="base-url">http[^<]+<\/code>/);
    expect(body).toContain('href="/reference/"');
    expect(body).toContain('href="/openapi.json"');
    expect(body).toMatch(/href="https?:\/\/[^"]+\/api\/overview\/"/);
    expect(body.match(/class="row"/g)).toHaveLength(3);
    expect(body.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(body).toContain('/v1/auth/session');
    for (const gone of ['/v1/auth/siws/verify', '/v1/me', 'Planned', '<table', '/metrics']) {
      expect(body).not.toContain(gone);
    }
  });
  it('stays flat and editorial: no glow, gradients, glass, shadows or big radii', async () => {
    const { app } = makeTestApp();
    const body = (await getPortal(app)).body;
    for (const banned of [
      'gradient',
      'box-shadow',
      'text-shadow',
      'drop-shadow',
      'backdrop-filter',
      'filter:',
      'background-clip:text',
    ]) {
      expect(body).not.toContain(banned);
    }
    const radii = [...body.matchAll(/border-radius:(\d+)px/g)].map((m) => Number(m[1]));
    expect(radii.every((r) => r <= 6)).toBe(true);
    expect(body).toContain('#43acfb');
  });
});

describe('OpenAPI document quality', () => {
  it('has a summary and description for every operation and tags in order', async () => {
    const { app } = makeTestApp();
    const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
    expect(doc.tags.map((t: { name: string }) => t.name)).toEqual([
      'System',
      'Auth',
      'Account',
      'X feed',
      'Markets',
      'Share',
      'Media',
    ]);
    const missing: string[] = [];
    for (const [path, item] of Object.entries<
      Record<string, { summary?: string; description?: string; tags?: string[] }>
    >(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (!op.summary || !op.description || !op.tags?.length) missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
    expect(doc.paths['/v1/me'].get.security).toEqual([{ session: [] }]);
    expect(doc.paths['/v1/auth/session'].get.security).toEqual([{}, { session: [] }]);
  });

  it('keeps the reserved (501) provider routes out of the public document, while they still answer', async () => {
    const { app } = makeTestApp();
    const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
    const paths = Object.keys(doc.paths);
    expect(paths.filter((p) => /\/v1\/auth\/(email|x|google|telegram|discord)\//.test(p))).toEqual([]);
    expect(paths).toContain('/v1/auth/siws/verify');
    const res = await app.inject({ method: 'GET', url: '/v1/auth/google/start' });
    expect(res.statusCode).toBe(501);
  });
});

describe('highlight', () => {
  it('escapes HTML and keeps the text intact', () => {
    const code = `const a = '<b>'; // "x" & y\ncurl https://api.windle.fun -H 'X: 1'`;
    const html = highlight(code);
    expect(html).not.toContain('<b>');
    const text = html
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    expect(text.replace(/&#39;/g, "'").replace(/&amp;/g, '&')).toBe(code);
  });
});
