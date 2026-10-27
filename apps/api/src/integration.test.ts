// Integration tests against real Postgres + Redis. Skipped unless both URLs are set:
//
//   INTEGRATION_DATABASE_URL=postgres://windle_owner:...@127.0.0.1:5432/windle_test \
//   INTEGRATION_REDIS_URL=redis://:...@127.0.0.1:6379/15 \
//   npm run test:integration -w @windle/api
//
// Use a scratch database and a spare Redis db index: the suite runs migrations, creates users and deletes them
// again at the end. INTEGRATION_DATABASE_MIGRATION_URL (owner role) is used for migrations when the runtime URL is
// the DML-only role.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandlesResponse, Me, MediaUploadResponse } from '@windle/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import pino from 'pino';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { runMigrations } from './db/migrator.ts';
import * as schema from './db/schema.ts';
import { PostgresMarketRepository } from './markets/postgres.ts';
import { PostgresMediaRepository } from './media/postgres.ts';
import { MediaStorage } from './media/storage.ts';
import { FIXTURE_MARKETS, SYSTEM_USER_ID, seedFixtureMarkets } from './seed/fixture-markets.ts';
import { createDb, createSql, PostgresUserRepository } from './store/postgres.ts';
import { createRedis, RedisEphemeralStore } from './store/redis.ts';
import {
  APP_ORIGIN,
  AUTH_ORIGIN,
  getNonce,
  newWallet,
  signIn,
  signVerifyBody,
  siwsText,
  verify,
} from './test/helpers.ts';
import { XFeedHub } from './x-feed/hub.ts';

const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
const REDIS_URL = process.env.INTEGRATION_REDIS_URL;
const MIGRATION_URL = process.env.INTEGRATION_DATABASE_MIGRATION_URL ?? DATABASE_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('integration: Postgres + Redis', () => {
  const quiet = { warn: () => {}, info: () => {} };
  let sql: ReturnType<typeof createSql>;
  let redis: Redis;
  let app: ReturnType<typeof buildApp>;
  const createdUsers: string[] = [];
  const createdMarkets: string[] = [];
  const createdMedia: string[] = [];
  const mediaRoot = mkdtempSync(join(tmpdir(), 'windle-it-media-'));

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
      MARKET_TRADE_PER_MINUTE: '1000',
      LEADERBOARD_CACHE_SECONDS: '0',
      MEDIA_ROOT: mediaRoot,
      IMGPROXY_KEY: 'ab'.repeat(64),
      IMGPROXY_SALT: 'cd'.repeat(64),
    });
    app = buildApp(config, {
      store: new RedisEphemeralStore(redis),
      repo: new PostgresUserRepository(createDb(sql)),
      rateLimitRedis: redis,
      markets: new PostgresMarketRepository(createDb(sql)),
      media: new PostgresMediaRepository(createDb(sql)),
      xFeed: new XFeedHub({
        relayUrl: 'http://relay.test',
        log: pino({ level: 'silent' }),
        fetch: async (input) => {
          const id = String(input).split('/post/')[1] ?? '';
          const at = new Date().toISOString();
          return new Response(
            JSON.stringify({
              id,
              kind: 'tweet',
              createdAt: at,
              receivedAt: at,
              url: `https://x.com/it_windle/status/${id}`,
              author: { id: '1', handle: 'it_windle', name: 'it', avatarUrl: null, followers: null, tags: [] },
              text: 'integration',
              media: [],
              quoted: null,
              inReplyTo: null,
              source: 'gmgn',
            }),
          );
        },
      }),
    });
    await app.ready();
  });

  afterAll(async () => {
    const db = createDb(sql);
    if (createdMarkets.length > 0) {
      await db.delete(schema.marketResolutions).where(inArray(schema.marketResolutions.marketId, createdMarkets));
      await db.delete(schema.trades).where(inArray(schema.trades.marketId, createdMarkets));
      await db.delete(schema.positions).where(inArray(schema.positions.marketId, createdMarkets));
      await db.delete(schema.markets).where(inArray(schema.markets.id, createdMarkets));
    }
    if (createdMedia.length > 0) await db.delete(schema.media).where(inArray(schema.media.id, createdMedia));
    rmSync(mediaRoot, { recursive: true, force: true });
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

  it('trades under concurrency with row locks, settles in one transaction and ranks in SQL', async () => {
    const send = (url: string, token: string, body: unknown) =>
      app.inject({
        method: 'POST',
        url,
        headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
        cookies: { wl_session: token },
        payload: JSON.stringify(body),
      });
    const signed = async () => {
      const { token, res } = await signIn(app, newWallet());
      createdUsers.push(res.json().me.id);
      return token;
    };
    const creator = await signed();
    const id = `18${String(Date.now()).padStart(17, '0')}`;
    const created = await send('/v1/markets', creator, {
      tweetUrl: `https://x.com/it_windle/status/${id}`,
      statement: 'Integration test market resolves YES after concurrent trades.',
      criteria: 'Resolved by the integration test itself, right after trading.',
      deadline: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      project: { name: 'Integration', ticker: 'ITST' },
      source: {
        id,
        url: `https://x.com/it_windle/status/${id}`,
        author: { handle: 'it_windle', name: 'it' },
        text: 'integration',
        createdAt: new Date().toISOString(),
        capturedAt: new Date().toISOString(),
      },
    });
    expect(created.statusCode).toBe(201);
    const market = created.json().market;
    createdMarkets.push(market.id);

    const traders = await Promise.all([signed(), signed(), signed(), signed()]);
    const trades = await Promise.all(
      traders.flatMap((t, i) => [
        send(`/v1/markets/${market.slug}/trades`, t, { action: 'buy', side: i % 2 ? 'no' : 'yes', amountPts: 10 }),
        send(`/v1/markets/${market.slug}/trades`, t, { action: 'buy', side: 'yes', amountPts: 5 }),
      ]),
    );
    expect(trades.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
    const db = createDb(sql);
    const [row] = await db.select().from(schema.markets).where(eq(schema.markets.id, market.id));
    const yesShares = trades.map((r) => r.json().trade).filter((t) => t.side === 'yes');
    expect(row?.tradeCount).toBe(8);
    expect(row?.traders).toBe(4);
    expect(row?.volumeMicro).toBe(60_000_000);
    expect(row?.qYes).toBeCloseTo(
      market.qYes + yesShares.reduce((s: number, t: { shares: number }) => s + t.shares, 0),
      6,
    );
    expect(row?.buyCount).toBe(8);

    const candles = CandlesResponse.parse(
      (await app.inject({ method: 'GET', url: `/v1/markets/${market.slug}/candles?tf=1m&side=no` })).json(),
    );
    const traded = candles.candles.filter((c) => c.n > 0);
    expect(traded.reduce((n, c) => n + c.n, 0)).toBe(8);
    expect(traded.reduce((v, c) => v + c.v, 0)).toBeCloseTo(60, 6);
    expect(candles.candles[0]?.o).toBeCloseTo(1 - market.probYes, 12);
    expect(candles.candles.at(-1)?.c).toBeCloseTo(1 - (row?.probYes ?? 0), 12);
    for (const c of candles.candles) expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c) - 1e-12);
    const steps = candles.candles.slice(1).map((c, i) => c.t - (candles.candles[i]?.t ?? 0));
    expect(steps.every((d) => d === 60)).toBe(true);
    const prices = await new PostgresMarketRepository(db).pricesAt([market.id], new Date());
    expect(prices.get(market.id)).toBeCloseTo(row?.probYes ?? 0, 12);

    const [first, second] = await Promise.all([
      send(`/v1/markets/${market.slug}/resolve`, creator, { outcome: 'yes' }),
      send(`/v1/markets/${market.slug}/resolve`, creator, { outcome: 'yes' }),
    ]);
    expect([first?.json().alreadyResolved, second?.json().alreadyResolved].sort()).toEqual([false, true]);
    const accounts = await db.select().from(schema.accounts);
    const positions = await db.select().from(schema.positions).where(eq(schema.positions.marketId, market.id));
    for (const p of positions) {
      const acct = accounts.find((a) => a.userId === p.userId);
      expect(p.settledAt).not.toBeNull();
      expect(acct?.balanceMicro).toBe(1_000_000_000 - 15_000_000 + (p.payoutMicro ?? 0));
    }

    const board = await app.inject({
      method: 'GET',
      url: '/v1/leaderboard',
      cookies: { wl_session: traders[0] ?? '' },
    });
    const body = board.json();
    const worth = body.entries.map((e: { netWorthPts: number }) => e.netWorthPts);
    expect([...worth].sort((a, b) => b - a)).toEqual(worth);
    expect(body.me.rank).toBeGreaterThanOrEqual(1);
  });

  it('seeds the sample markets once', async () => {
    const repo = new PostgresMarketRepository(createDb(sql));
    const before = await createDb(sql)
      .select({ slug: schema.markets.slug })
      .from(schema.markets)
      .where(
        inArray(
          schema.markets.slug,
          FIXTURE_MARKETS.map((f) => f.slug),
        ),
      );
    const first = await seedFixtureMarkets(repo, new Date());
    const again = await seedFixtureMarkets(repo, new Date());
    expect(first.inserted.length + before.length).toBe(FIXTURE_MARKETS.length);
    expect(again.inserted).toEqual([]);
    for (const slug of first.inserted) {
      const m = await repo.marketBySlug(slug);
      if (m) createdMarkets.push(m.id);
    }
    if (before.length === 0) createdUsers.push(SYSTEM_USER_ID);
  });

  it('uploads an image, attaches it to a market and an avatar, and takes it down', async () => {
    const { token, res, wallet } = await signIn(app, newWallet());
    const userId: string = res.json().me.id;
    createdUsers.push(userId);
    const headers = { origin: APP_ORIGIN, cookie: `wl_session=${token}` };
    const png = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#2255aa' } })
      .png()
      .toBuffer();
    const up = await app.inject({
      method: 'POST',
      url: '/v1/media?kind=market',
      headers: { ...headers, 'content-type': 'image/png' },
      payload: png,
    });
    expect([200, 201]).toContain(up.statusCode);
    const { image } = MediaUploadResponse.parse(up.json());
    createdMedia.push(image.id);
    expect(image).toMatchObject({ width: 96, height: 64 });
    expect(await new MediaStorage(mediaRoot).has(image.id)).toBe(true);

    const id = `19${String(Date.now()).padStart(17, '0')}`;
    const created = await app.inject({
      method: 'POST',
      url: '/v1/markets',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify({
        tweetUrl: `https://x.com/it_windle/status/${id}`,
        statement: 'Integration test market carries an uploaded image.',
        criteria: 'Resolved by nobody; the integration test only checks the image.',
        durationPreset: 'day',
        project: { name: 'Integration', ticker: 'ITIM' },
        imageId: image.id,
        source: {
          id,
          url: `https://x.com/it_windle/status/${id}`,
          author: { handle: 'it_windle', name: 'it' },
          text: 'integration',
          createdAt: new Date().toISOString(),
          capturedAt: new Date().toISOString(),
        },
      }),
    });
    expect(created.statusCode).toBe(201);
    const market = created.json().market;
    createdMarkets.push(market.id);
    expect(market.image.id).toBe(image.id);
    const [row] = await createDb(sql).select().from(schema.markets).where(eq(schema.markets.id, market.id));
    expect(row?.imageId).toBe(image.id);

    const avatar = await app.inject({
      method: 'PUT',
      url: '/v1/me/avatar',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify({ mediaId: image.id }),
    });
    expect(avatar.statusCode).toBe(200);
    const me = Me.parse((await app.inject({ method: 'GET', url: '/v1/me', headers })).json());
    expect(me.avatar?.id).toBe(image.id);
    expect(wallet.address).toBe(me.wallets[0]?.address);

    const media = new PostgresMediaRepository(createDb(sql));
    const removal = await media.remove(image.id, userId, new Date());
    expect(removal).toMatchObject({ removed: true, detachedAvatars: 1 });
    expect(await new PostgresMarketRepository(createDb(sql)).detachImage(image.id)).toBe(1);
    const after = await app.inject({ method: 'GET', url: `/v1/markets/${market.slug}` });
    expect(after.json().market.image).toBeNull();
    expect(await media.totalActiveBytes()).toBeGreaterThanOrEqual(0);
  });

  it('rate-limit counters live in Redis', async () => {
    const before = await redis.keys('wl:rl:*');
    await app.inject({ method: 'GET', url: '/', headers: { 'x-real-ip': '198.51.100.99' } });
    const after = await redis.keys('wl:rl:*');
    expect(after.length).toBeGreaterThanOrEqual(Math.max(before.length, 1));
  });
});
