// Integration tests against real Postgres + Redis. Skipped unless both URLs are set:
//
//   INTEGRATION_DATABASE_URL=postgres://windle_owner:...@127.0.0.1:5432/windle_test \
//   INTEGRATION_REDIS_URL=redis://:...@127.0.0.1:6379/15 \
//   npm run test:integration -w @windle/api
//
// Use a scratch database and a spare Redis db index: the suite runs migrations, creates users and deletes them
// again at the end. INTEGRATION_DATABASE_MIGRATION_URL (owner role) is used for migrations when the runtime URL is
// the DML-only role.
import { fileURLToPath } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { runMigrations } from './db/migrator.ts';
import * as schema from './db/schema.ts';
import { createDb, createSql, PostgresUserRepository } from './store/postgres.ts';
import { createRedis, RedisEphemeralStore } from './store/redis.ts';
import { AUTH_ORIGIN, getNonce, newWallet, signIn, signVerifyBody, siwsText, verify } from './test/helpers.ts';

const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
const REDIS_URL = process.env.INTEGRATION_REDIS_URL;
const MIGRATION_URL = process.env.INTEGRATION_DATABASE_MIGRATION_URL ?? DATABASE_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('integration: Postgres + Redis', () => {
  const quiet = { warn: () => {}, info: () => {} };
  let sql: ReturnType<typeof createSql>;
  let redis: Redis;
  let app: ReturnType<typeof buildApp>;
  const createdUsers: string[] = [];

  beforeAll(async () => {
    await runMigrations(MIGRATION_URL as string, fileURLToPath(new URL('../drizzle', import.meta.url)));
    sql = createSql(DATABASE_URL as string, 4);
    redis = createRedis(REDIS_URL as string, 'it', quiet);
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', () => resolve());
      redis.once('end', () => reject(new Error('redis did not connect')));
    });
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SIWS_URI: 'https://oauth.windle.fun',
      SESSION_COOKIE_DOMAIN: '.windle.fun',
      SESSION_COOKIE_SECURE: 'true',
      RATE_LIMIT_AUTH_MAX: '50',
    });
    app = buildApp(config, {
      store: new RedisEphemeralStore(redis),
      repo: new PostgresUserRepository(createDb(sql)),
      rateLimitRedis: redis,
    });
    await app.ready();
  });

  afterAll(async () => {
    if (createdUsers.length > 0) {
      await createDb(sql).delete(schema.users).where(inArray(schema.users.id, createdUsers));
    }
    await app?.close();
    await sql?.end({ timeout: 5 });
    redis?.disconnect();
  });

  it('/ready reports both dependencies up', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.json()).toMatchObject({ status: 'ready' });
  });

  it('signs in, persists user + wallet + audit, resolves and ends the session', async () => {
    const wallet = newWallet();
    const { token, res } = await signIn(app, wallet);
    const userId: string = res.json().me.id;
    createdUsers.push(userId);

    const db = createDb(sql);
    const [w] = await db.select().from(schema.wallets).where(eq(schema.wallets.address, wallet.address));
    expect(w?.userId).toBe(userId);
    const audit = await db.select().from(schema.sessionsAudit).where(eq(schema.sessionsAudit.userId, userId));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.revokedAt).toBeNull();

    const session = await app.inject({ method: 'GET', url: '/v1/auth/session', cookies: { wl_session: token } });
    expect(session.json()).toMatchObject({ authenticated: true, userId });
    const me = await app.inject({ method: 'GET', url: '/v1/me', cookies: { wl_session: token } });
    expect(me.json().wallets).toHaveLength(1);

    const out = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: AUTH_ORIGIN },
      cookies: { wl_session: token },
    });
    expect(out.statusCode).toBe(204);
    const [closed] = await db.select().from(schema.sessionsAudit).where(eq(schema.sessionsAudit.userId, userId));
    expect(closed?.revokeReason).toBe('logout');
  });

  it('a nonce is single-use in Redis, even under concurrent verifies', async () => {
    const wallet = newWallet();
    const { nonce, input } = await getNonce(app);
    const body = signVerifyBody(wallet, siwsText(input, wallet.address), nonce);
    const results = await Promise.all([verify(app, body), verify(app, body), verify(app, body)]);
    const ok = results.filter((r) => r.statusCode === 200);
    expect(ok).toHaveLength(1);
    createdUsers.push(ok[0]?.json().me.id);
    expect(results.filter((r) => r.json().error?.code === 'nonce_invalid')).toHaveLength(2);
  });

  it('concurrent first sign-ins of one wallet end up as one user', async () => {
    const wallet = newWallet();
    const nonces = await Promise.all([getNonce(app), getNonce(app)]);
    const results = await Promise.all(
      nonces.map(({ nonce, input }) => verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce))),
    );
    const ids = results.map((r) => r.json().me.id);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(ids[0]).toBe(ids[1]);
    createdUsers.push(ids[0]);
  });

  it('rate-limit counters live in Redis', async () => {
    const before = await redis.keys('wl:rl:*');
    await app.inject({ method: 'GET', url: '/', headers: { 'x-real-ip': '198.51.100.99' } });
    const after = await redis.keys('wl:rl:*');
    expect(after.length).toBeGreaterThanOrEqual(Math.max(before.length, 1));
  });
});
