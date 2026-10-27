import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import {
  type AdminMediaRemoveResponse,
  type AdminMediaReportsResponse,
  type ApiError,
  type CreateMarketRequest,
  CreateMarketResponse,
  LeaderboardResponse,
  MarketDetailResponse,
  Me,
  MediaUploadResponse,
  type SetAvatarResponse,
  type TweetSnapshot,
  XPost,
} from '@windle/shared';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ORIGIN, makeTestApp, newWallet, signIn, type Wallet } from '../test/helpers.ts';
import { XFeedHub } from '../x-feed/hub.ts';
import { sniffFormat } from './process.ts';
import { MediaStorage } from './storage.ts';
import { imgproxyUrl, presetUrls, signPath } from './urls.ts';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const KEY = 'ab'.repeat(64);
const SALT = 'cd'.repeat(64);
const ADMIN = newWallet();

const roots: string[] = [];
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function echoRelay() {
  return new XFeedHub({
    relayUrl: 'http://relay.test',
    log: pino({ level: 'silent' }),
    fetch: async (input) => {
      const id = String(input).split('/post/')[1] ?? '';
      return new Response(
        JSON.stringify(
          XPost.parse({
            id,
            kind: 'tweet',
            createdAt: '2026-10-11T10:00:00.000Z',
            receivedAt: '2026-10-11T10:00:01.000Z',
            url: `https://x.com/sproutfi_dev/status/${id}`,
            author: { id: '1', handle: 'sproutfi_dev', name: 'Sprout', avatarUrl: null, followers: 1, tags: [] },
            text: 'staking v2 ships friday',
            media: [],
            quoted: null,
            inReplyTo: null,
            source: 'gmgn',
          }),
        ),
      );
    },
  });
}

function setup(env: Record<string, string> = {}, mediaFetch?: typeof fetch) {
  const root = mkdtempSync(join(tmpdir(), 'windle-media-test-'));
  roots.push(root);
  const built = makeTestApp({
    clock: { now: NOW },
    xFeed: echoRelay(),
    ...(mediaFetch ? { mediaFetch } : {}),
    env: {
      MEDIA_ROOT: root,
      IMGPROXY_KEY: KEY,
      IMGPROXY_SALT: SALT,
      ADMIN_WALLETS: ADMIN.address,
      ...env,
    },
  });
  app = built.app;
  return { ...built, root, storage: new MediaStorage(root) };
}

async function session(a: FastifyInstance, wallet: Wallet = newWallet()) {
  const { token } = await signIn(a, wallet);
  return { wallet, headers: { origin: APP_ORIGIN, cookie: `wl_session=${token}` } };
}

const upload = (a: FastifyInstance, headers: Record<string, string>, body: Buffer, type: string, query = '') =>
  a.inject({
    method: 'POST',
    url: `/v1/media${query}`,
    headers: { ...headers, 'content-type': type },
    payload: body,
  });

const solid = (width: number, height: number, color: string, alpha = false) =>
  sharp({
    create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 255, g: 0, b: 0, alpha: 0.5 } : color },
  });

/** A PNG whose header claims width x height; the pixel data is a token, so it is tiny on the wire. */
function pngHeaderOnly(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(1024))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let tweetSeq = 0;
function snapshot(): TweetSnapshot {
  tweetSeq += 1;
  const id = `19468112000000${String(10_000 + tweetSeq)}`;
  return {
    id,
    url: `https://x.com/sproutfi_dev/status/${id}`,
    author: { handle: 'sproutfi_dev', name: 'Sprout' },
    text: 'staking v2 ships friday',
    createdAt: '2026-10-11T10:00:00.000Z',
    capturedAt: '2026-10-11T11:00:00.000Z',
  };
}

function marketBody(imageId?: string): CreateMarketRequest {
  const source = snapshot();
  return {
    tweetUrl: source.url,
    statement: 'Sprout deploys staking v2 to Solana mainnet by Friday.',
    criteria: 'YES if staking v2 is deployed on Solana mainnet before the deadline.',
    durationPreset: 'day',
    project: { name: 'Sproutfi', ticker: 'SPRT' },
    source,
    ...(imageId ? { imageId } : {}),
  };
}

const createMarket = (a: FastifyInstance, headers: Record<string, string>, body: CreateMarketRequest) =>
  a.inject({ method: 'POST', url: '/v1/markets', headers, payload: body });

describe('signed URLs', () => {
  const ID = 'a'.repeat(64);
  const cfg = { cdnOrigin: 'https://cdn.windle.fun', key: KEY, salt: SALT };

  it('match infra/scripts/imgproxy-url.sh byte for byte', () => {
    // Minted with: IMGPROXY_ENV_FILE=<key ab*64, salt cd*64> imgproxy-url.sh <options> media/aa/<id>.webp [fmt]
    expect(imgproxyUrl(cfg, 'rs:fill:64:64:1/g:sm', `media/aa/${ID}.webp`, 'webp')).toBe(
      `https://cdn.windle.fun/img/y8xjw3UK_HLX_4Hr20xdrDXIlI4sRA1uqxyiBz8TwNk/rs:fill:64:64:1/g:sm/plain/media/aa/${ID}.webp@webp`,
    );
    expect(imgproxyUrl(cfg, 'rs:fit:480:480', `media/aa/${ID}.webp`)).toBe(
      `https://cdn.windle.fun/img/VVYFnSVMWVTTFENcuBnP07SGH5dGwTpK5I2WOA-Oj1s/rs:fit:480:480/plain/media/aa/${ID}.webp`,
    );
    expect(signPath('/x', KEY, SALT)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('pins WebP (and JPEG for og) by default, leaves the rest to Accept in auto mode', () => {
    const pinned = presetUrls(cfg, ID, 'webp');
    expect(pinned.avatar64).toMatch(/\/rs:fill:64:64:1\/g:sm\/plain\/media\/aa\/a{64}\.webp@webp$/);
    expect(pinned.card).toMatch(/\/rs:fit:480:480\/plain\/media\/aa\/a{64}\.webp@webp$/);
    expect(pinned.og).toMatch(/\/rs:fill:1200:630:1\/g:sm\/plain\/media\/aa\/a{64}\.webp@jpg$/);
    const auto = presetUrls(cfg, ID, 'auto');
    expect(auto.cover).toMatch(/\/rs:fit:1200:1200\/plain\/media\/aa\/a{64}\.webp$/);
    expect(auto.og).toBe(pinned.og);
  });
});

describe('POST /v1/media', () => {
  it.each([
    ['image/jpeg', () => solid(640, 480, '#3366cc').jpeg().toBuffer()],
    ['image/png', () => solid(640, 480, '#3366cc').png().toBuffer()],
    ['image/webp', () => solid(640, 480, '#3366cc').webp().toBuffer()],
  ])('stores a %s upload as one WebP master named by its sha256', async (type, make) => {
    const { app: a, storage } = setup();
    const { headers } = await session(a);
    const res = await upload(a, headers, await make(), type);
    expect(res.statusCode).toBe(201);
    const { image, created } = MediaUploadResponse.parse(res.json());
    expect(created).toBe(true);
    expect(image).toMatchObject({ width: 640, height: 480 });
    expect(image.thumbhash.length).toBeGreaterThan(10);
    expect(image.urls.thumb).toContain(`/plain/media/${image.id.slice(0, 2)}/${image.id}.webp@webp`);
    const master = await storage.read(image.id);
    expect(master && sniffFormat(master)).toBe('webp');
    const { createHash } = await import('node:crypto');
    expect(
      createHash('sha256')
        .update(master ?? Buffer.alloc(0))
        .digest('hex'),
    ).toBe(image.id);
  });

  it('keeps a small transparent PNG lossless and caps the long edge at 2048', async () => {
    const { app: a, storage } = setup();
    const { headers } = await session(a);
    const logo = await upload(a, headers, await solid(200, 200, '', true).png().toBuffer(), 'image/png');
    const logoMaster = await storage.read(MediaUploadResponse.parse(logo.json()).image.id);
    const logoMeta = await sharp(logoMaster ?? Buffer.alloc(0)).metadata();
    expect(logoMeta.hasAlpha).toBe(true);
    const big = await upload(a, headers, await solid(4000, 1000, '#224466').jpeg().toBuffer(), 'image/jpeg');
    expect(MediaUploadResponse.parse(big.json()).image).toMatchObject({ width: 2048, height: 512 });
  });

  it('refuses bytes that are not the declared type, and other content types', async () => {
    const { app: a } = setup();
    const { headers } = await session(a);
    const png = await solid(16, 16, '#000').png().toBuffer();
    const mismatch = await upload(a, headers, png, 'image/jpeg');
    expect(mismatch.statusCode).toBe(415);
    expect(mismatch.json<ApiError>().error.code).toBe('media_type_mismatch');
    const text = await upload(a, headers, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png');
    expect(text.json<ApiError>().error.code).toBe('media_type_mismatch');
    const svg = await upload(a, headers, Buffer.from('<svg/>'), 'image/svg+xml');
    expect(svg.statusCode).toBe(415);
    expect(svg.json<ApiError>().error.code).toBe('unsupported_media_type');
    const truncated = await upload(a, headers, png.subarray(0, 40), 'image/png');
    expect(truncated.statusCode).toBe(422);
    expect(truncated.json<ApiError>().error.code).toBe('media_invalid');
  });

  it('refuses bodies over 10 MB and pixel bombs', async () => {
    const { app: a } = setup();
    const { headers } = await session(a);
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1);
    huge.set([0xff, 0xd8, 0xff]);
    const tooBig = await upload(a, headers, huge, 'image/jpeg');
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json<ApiError>().error.code).toBe('payload_too_large');
    const bomb = pngHeaderOnly(20_000, 20_000);
    expect(bomb.length).toBeLessThan(2000);
    const res = await upload(a, headers, bomb, 'image/png');
    expect(res.statusCode).toBe(422);
    expect(res.json<ApiError>().error.code).toBe('media_too_many_pixels');
  });

  it('applies EXIF orientation, then strips EXIF, GPS, XMP and ICC', async () => {
    const { app: a, storage } = setup();
    const { headers } = await session(a);
    const jpeg = await solid(40, 20, '#cc3300')
      .jpeg()
      .withExif({
        IFD0: { Copyright: 'someone', Artist: 'someone' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const before = await sharp(jpeg).metadata();
    expect(before.exif).toBeDefined();
    expect(before.orientation).toBe(6);
    const res = await upload(a, headers, jpeg, 'image/jpeg');
    const { image } = MediaUploadResponse.parse(res.json());
    expect(image).toMatchObject({ width: 20, height: 40 });
    const master = await storage.read(image.id);
    const meta = await sharp(master ?? Buffer.alloc(0)).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(master?.includes(Buffer.from('someone'))).toBe(false);
  });

  it('keeps only the first frame of an animation', async () => {
    const { app: a, storage } = setup();
    const { headers } = await session(a);
    const frames = await Promise.all(['#ff0000', '#0000ff'].map((c) => solid(32, 32, c).png().toBuffer()));
    const animated = await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    const res = await upload(a, headers, animated, 'image/webp');
    const { image } = MediaUploadResponse.parse(res.json());
    const master = await storage.read(image.id);
    const meta = await sharp(master ?? Buffer.alloc(0)).metadata();
    expect(meta.pages ?? 1).toBe(1);
    expect(image).toMatchObject({ width: 32, height: 32 });
    const { dominant } = await sharp(master ?? Buffer.alloc(0)).stats();
    expect(dominant.r).toBeGreaterThan(200);
  });

  it('dedupes: the same image is one id, and every uploader may attach it', async () => {
    const { app: a } = setup();
    const alice = await session(a);
    const bob = await session(a);
    const body = await solid(64, 64, '#11aa55').png().toBuffer();
    const first = await upload(a, alice.headers, body, 'image/png');
    const again = await upload(a, alice.headers, body, 'image/png');
    const other = await upload(a, bob.headers, body, 'image/png', '?kind=avatar');
    expect([first.statusCode, again.statusCode, other.statusCode]).toEqual([201, 200, 200]);
    const id = MediaUploadResponse.parse(first.json()).image.id;
    expect(MediaUploadResponse.parse(again.json())).toMatchObject({ created: false, image: { id } });
    expect(MediaUploadResponse.parse(other.json()).image.id).toBe(id);
    const set = await a.inject({ method: 'PUT', url: '/v1/me/avatar', headers: bob.headers, payload: { mediaId: id } });
    expect(set.statusCode).toBe(200);
  });

  it('needs a session and an allowed origin before reading the body', async () => {
    const { app: a } = setup();
    const body = await solid(8, 8, '#000').png().toBuffer();
    const anon = await upload(a, { origin: APP_ORIGIN }, body, 'image/png');
    expect(anon.statusCode).toBe(401);
    const { headers } = await session(a);
    const csrf = await upload(a, { ...headers, origin: 'https://evil.example' }, body, 'image/png');
    expect(csrf.statusCode).toBe(403);
    expect(csrf.json<ApiError>().error.code).toBe('csrf_rejected');
  });

  it('limits uploads per minute and per day', async () => {
    const burst = setup({ MEDIA_UPLOADS_PER_MINUTE: '2' });
    const s1 = await session(burst.app);
    const body = await solid(8, 8, '#123456').png().toBuffer();
    expect((await upload(burst.app, s1.headers, body, 'image/png')).statusCode).toBe(201);
    expect((await upload(burst.app, s1.headers, body, 'image/png')).statusCode).toBe(200);
    const third = await upload(burst.app, s1.headers, body, 'image/png');
    expect(third.statusCode).toBe(429);
    expect(third.json<ApiError>().error.code).toBe('rate_limited');
    await burst.app.close();

    const daily = setup({ MEDIA_UPLOADS_PER_DAY: '1' });
    const s2 = await session(daily.app);
    expect((await upload(daily.app, s2.headers, body, 'image/png')).statusCode).toBe(201);
    const over = await upload(daily.app, s2.headers, body, 'image/png');
    expect(over.statusCode).toBe(429);
    expect(over.json<ApiError>().error.code).toBe('media_quota_exceeded');
    expect(over.headers['retry-after']).toBeDefined();
    const other = await session(daily.app);
    expect((await upload(daily.app, other.headers, body, 'image/png')).statusCode).toBe(200);
  });

  it('answers 507 when the storage cap is reached', async () => {
    const { app: a } = setup({ MEDIA_MAX_TOTAL_BYTES: '1000000' });
    const { headers } = await session(a);
    const noisy = await sharp(Buffer.from(Array.from({ length: 1600 * 1600 * 3 }, (_, i) => (i * 7919) % 251)), {
      raw: { width: 1600, height: 1600, channels: 3 },
    })
      .png({ compressionLevel: 1 })
      .toBuffer();
    const res = await upload(a, headers, noisy, 'image/png');
    expect(res.statusCode).toBe(507);
    expect(res.json<ApiError>().error.code).toBe('media_storage_full');
  });
});

describe('attaching, reporting and taking down', () => {
  it('attaches only your own active uploads to markets and avatars', async () => {
    const { app: a } = setup();
    const alice = await session(a);
    const bob = await session(a);
    const up = await upload(a, alice.headers, await solid(64, 64, '#ff0000').png().toBuffer(), 'image/png');
    const id = MediaUploadResponse.parse(up.json()).image.id;

    const foreign = await createMarket(a, bob.headers, marketBody(id));
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json<ApiError>().error.code).toBe('media_not_owned');
    const avatar = await a.inject({
      method: 'PUT',
      url: '/v1/me/avatar',
      headers: bob.headers,
      payload: { mediaId: id },
    });
    expect(avatar.json<ApiError>().error.code).toBe('media_not_owned');
    const unknown = await createMarket(a, alice.headers, marketBody('f'.repeat(64)));
    expect(unknown.json<ApiError>().error.code).toBe('media_not_found');

    const created = await createMarket(a, alice.headers, marketBody(id));
    expect(created.statusCode).toBe(201);
    const { market } = CreateMarketResponse.parse(created.json());
    expect(market.image?.id).toBe(id);
    const list = await a.inject({ method: 'GET', url: '/v1/markets' });
    expect(list.json().markets[0].image.id).toBe(id);

    const set = await a.inject({
      method: 'PUT',
      url: '/v1/me/avatar',
      headers: alice.headers,
      payload: { mediaId: id },
    });
    expect(set.json<SetAvatarResponse>().avatar?.id).toBe(id);
    const me = Me.parse((await a.inject({ method: 'GET', url: '/v1/me', headers: alice.headers })).json());
    expect(me.avatar?.urls.avatar64).toContain(id);
    const cleared = await a.inject({
      method: 'PUT',
      url: '/v1/me/avatar',
      headers: alice.headers,
      payload: { mediaId: null },
    });
    expect(cleared.json<SetAvatarResponse>().avatar).toBeNull();
  });

  it('shows trader avatars on trades and the leaderboard', async () => {
    const { app: a } = setup();
    const creator = await session(a);
    const trader = await session(a);
    const created = await createMarket(a, creator.headers, marketBody());
    const { market } = CreateMarketResponse.parse(created.json());
    const up = await upload(a, trader.headers, await solid(64, 64, '#00ff00').png().toBuffer(), 'image/png');
    const id = MediaUploadResponse.parse(up.json()).image.id;
    await a.inject({ method: 'PUT', url: '/v1/me/avatar', headers: trader.headers, payload: { mediaId: id } });
    const trade = await a.inject({
      method: 'POST',
      url: `/v1/markets/${market.slug}/trades`,
      headers: trader.headers,
      payload: { action: 'buy', side: 'yes', amountPts: 10 },
    });
    expect(trade.statusCode).toBe(200);
    expect(trade.json().trade.avatar.id).toBe(id);
    const detail = MarketDetailResponse.parse(
      (await a.inject({ method: 'GET', url: `/v1/markets/${market.slug}` })).json(),
    );
    expect(detail.trades[0]?.avatar?.id).toBe(id);
    const board = LeaderboardResponse.parse(
      (await a.inject({ method: 'GET', url: '/v1/leaderboard', headers: trader.headers })).json(),
    );
    expect(board.entries.find((e) => e.address === trader.wallet.address)?.avatar?.id).toBe(id);
    expect(board.me?.avatar?.id).toBe(id);
  });

  it('takes one report per user and lists it for admins', async () => {
    const { app: a } = setup();
    const owner = await session(a);
    const reporter = await session(a);
    const up = await upload(a, owner.headers, await solid(32, 32, '#999999').png().toBuffer(), 'image/png');
    const id = MediaUploadResponse.parse(up.json()).image.id;
    const report = (reason: string) =>
      a.inject({ method: 'POST', url: `/v1/media/${id}/report`, headers: reporter.headers, payload: { reason } });
    expect((await report('spam')).statusCode).toBe(201);
    const dup = await report('hate');
    expect(dup.statusCode).toBe(409);
    expect(dup.json<ApiError>().error.code).toBe('media_already_reported');
    const missing = await a.inject({
      method: 'POST',
      url: `/v1/media/${'e'.repeat(64)}/report`,
      headers: reporter.headers,
      payload: { reason: 'spam' },
    });
    expect(missing.statusCode).toBe(404);

    const forbidden = await a.inject({ method: 'GET', url: '/v1/admin/media/reports', headers: reporter.headers });
    expect(forbidden.statusCode).toBe(403);
    const admin = await session(a, ADMIN);
    const list = await a.inject({ method: 'GET', url: '/v1/admin/media/reports', headers: admin.headers });
    const items = list.json<AdminMediaReportsResponse>().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ reports: 1, reasons: ['spam'], owner: owner.wallet.address, image: { id } });
  });

  it('admin takedown deletes the master, nulls it in DTOs, purges Cloudflare and blocks re-upload', async () => {
    const purges: unknown[] = [];
    const cf: typeof fetch = async (input, init) => {
      purges.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ success: true }), { headers: { 'content-type': 'application/json' } });
    };
    const { app: a, storage } = setup({ CF_ZONE_ID: 'zone1', CF_API_TOKEN: 'token1' }, cf);
    const owner = await session(a);
    const body = await solid(64, 64, '#ff00ff').png().toBuffer();
    const id = MediaUploadResponse.parse((await upload(a, owner.headers, body, 'image/png')).json()).image.id;
    const { market } = CreateMarketResponse.parse((await createMarket(a, owner.headers, marketBody(id))).json());
    await a.inject({ method: 'PUT', url: '/v1/me/avatar', headers: owner.headers, payload: { mediaId: id } });
    expect(await storage.has(id)).toBe(true);

    const denied = await a.inject({ method: 'DELETE', url: `/v1/admin/media/${id}`, headers: owner.headers });
    expect(denied.statusCode).toBe(403);

    const admin = await session(a, ADMIN);
    const res = await a.inject({ method: 'DELETE', url: `/v1/admin/media/${id}`, headers: admin.headers });
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminMediaRemoveResponse>()).toEqual({
      id,
      removed: true,
      detachedMarkets: 1,
      detachedAvatars: 1,
      cdnPurged: 'purged',
    });
    expect(await storage.has(id)).toBe(false);
    const files = purges.flatMap((p) => (p as { body: { files: string[] } }).body.files);
    expect((purges[0] as { url: string }).url).toBe('https://api.cloudflare.com/client/v4/zones/zone1/purge_cache');
    expect(files.some((f) => f.endsWith(`${id}.webp@webp`))).toBe(true);
    expect(files.some((f) => f.includes(`/v1/og/m/${market.slug}.png?v=`) && f.includes(`-i${id.slice(0, 12)}`))).toBe(
      true,
    );

    const detail = MarketDetailResponse.parse(
      (await a.inject({ method: 'GET', url: `/v1/markets/${market.slug}` })).json(),
    );
    expect(detail.market.image).toBeNull();
    const me = Me.parse((await a.inject({ method: 'GET', url: '/v1/me', headers: owner.headers })).json());
    expect(me.avatar).toBeNull();

    const reupload = await upload(a, owner.headers, body, 'image/png');
    expect(reupload.statusCode).toBe(410);
    expect(reupload.json<ApiError>().error.code).toBe('media_removed');
    const again = await a.inject({ method: 'DELETE', url: `/v1/admin/media/${id}`, headers: admin.headers });
    expect(again.json<AdminMediaRemoveResponse>()).toMatchObject({ removed: false, detachedMarkets: 0 });
  });

  it('draws the market image on the share card, read from disk', async () => {
    const { app: a } = setup({ PUBLIC_API_ORIGIN: 'https://api.windle.fun' });
    const owner = await session(a);
    const red = await solid(300, 300, '#ff0000').png().toBuffer();
    const id = MediaUploadResponse.parse((await upload(a, owner.headers, red, 'image/png')).json()).image.id;
    const { market } = CreateMarketResponse.parse((await createMarket(a, owner.headers, marketBody(id))).json());
    const page = await a.inject({ method: 'GET', url: `/v1/share/m/${market.slug}` });
    expect(page.body).toContain(`.png?v=1-50-open-i${id.slice(0, 12)}`);

    const png = await a.inject({ method: 'GET', url: `/v1/og/m/${market.slug}.png` });
    expect(png.statusCode).toBe(200);
    expect(png.headers['cache-control']).toBe('public, max-age=300');
    const { data, info } = await sharp(png.rawPayload).raw().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 255) < 60 && (data[i + 2] ?? 255) < 60) redPixels += 1;
    }
    expect(redPixels).toBeGreaterThan(184 * 184 * 0.8);
  }, 60_000);
});
