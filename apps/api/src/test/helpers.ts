import { ed25519 } from '@noble/curves/ed25519.js';
import type { SiwsNonce, SiwsSignInInput } from '@windle/shared';
import bs58 from 'bs58';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { MemoryMarketRepository } from '../markets/memory.ts';
import type { MarketRepository } from '../markets/types.ts';
import { MemoryMediaRepository } from '../media/memory.ts';
import type { MediaRepository } from '../media/types.ts';
import { type CacheStore, MemoryCacheStore } from '../store/cache.ts';
import { MemoryEphemeralStore, MemoryUserRepository } from '../store/memory.ts';
import type { EphemeralStore, UserRepository } from '../store/types.ts';
import type { XEnrichStore } from '../x-feed/enrich.ts';
import type { XFeedHub } from '../x-feed/hub.ts';

export const APP_ORIGIN = 'https://app.windle.fun';
export const AUTH_ORIGIN = 'https://oauth.windle.fun';

/** Production-shaped config (cookie Domain + Secure, real origins) with fakes and a controllable clock. */
export function makeTestApp(
  opts: {
    env?: Record<string, string>;
    store?: EphemeralStore;
    repo?: UserRepository;
    clock?: { now: number };
    xFeed?: XFeedHub;
    xEnrichStore?: XEnrichStore;
    xEnrichFetch?: typeof fetch;
    markets?: MarketRepository;
    cache?: CacheStore;
    media?: MediaRepository;
    mediaFetch?: typeof fetch;
  } = {},
) {
  const clock = opts.clock ?? { now: Date.parse('2026-10-11T12:00:00.000Z') };
  const store = opts.store ?? new MemoryEphemeralStore(() => clock.now);
  const repo = opts.repo ?? new MemoryUserRepository();
  const markets = opts.markets ?? new MemoryMarketRepository();
  const cache = opts.cache ?? new MemoryCacheStore({ now: () => clock.now });
  const media =
    opts.media ??
    new MemoryMediaRepository({
      addressOf: (userId) =>
        repo instanceof MemoryUserRepository
          ? ([...repo.wallets.values()].find((w) => w.userId === userId)?.address ?? null)
          : null,
    });
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SIWS_URI: 'https://oauth.windle.fun',
    SESSION_COOKIE_DOMAIN: '.windle.fun',
    SESSION_COOKIE_SECURE: 'true',
    CORS_ALLOWED_ORIGINS:
      'https://www.windle.fun,https://app.windle.fun,https://oauth.windle.fun,https://docs.windle.fun',
    ...opts.env,
  });
  const app = buildApp(config, {
    store,
    repo,
    now: () => new Date(clock.now),
    markets,
    cache,
    media,
    ...(opts.mediaFetch ? { mediaFetch: opts.mediaFetch } : {}),
    ...(opts.xFeed ? { xFeed: opts.xFeed } : {}),
    ...(opts.xEnrichStore ? { xEnrichStore: opts.xEnrichStore } : {}),
    ...(opts.xEnrichFetch ? { xEnrichFetch: opts.xEnrichFetch } : {}),
  });
  return { app, store, repo, clock, config, markets, cache, media };
}

export interface Wallet {
  secretKey: Uint8Array;
  address: string;
}

export function newWallet(): Wallet {
  const { secretKey, publicKey } = ed25519.keygen();
  return { secretKey, address: bs58.encode(publicKey) };
}

/**
 * The text a `solana:signIn` wallet signs, written out from the SIWS template here (independently of the code under
 * test) so a formatting bug in the api cannot hide behind a matching bug in the test.
 */
export function siwsText(input: SiwsSignInInput, address: string, overrides: Partial<SiwsSignInInput> = {}): string {
  const i = { ...input, ...overrides };
  return (
    `${i.domain} wants you to sign in with your Solana account:\n` +
    `${address}\n\n` +
    `${i.statement}\n\n` +
    `URI: ${i.uri}\n` +
    `Version: ${i.version}\n` +
    `Chain ID: ${i.chainId}\n` +
    `Nonce: ${i.nonce}\n` +
    `Issued At: ${i.issuedAt}\n` +
    `Expiration Time: ${i.expirationTime}`
  );
}

export function signVerifyBody(wallet: Wallet, text: string, nonce: string, signer: Wallet = wallet) {
  const bytes = new TextEncoder().encode(text);
  return {
    nonce,
    address: wallet.address,
    signedMessage: Buffer.from(bytes).toString('base64'),
    signature: bs58.encode(ed25519.sign(bytes, signer.secretKey)),
  };
}

export async function getNonce(app: FastifyInstance): Promise<SiwsNonce> {
  const res = await app.inject({ method: 'GET', url: '/v1/auth/siws/nonce', headers: { origin: AUTH_ORIGIN } });
  if (res.statusCode !== 200) throw new Error(`nonce: ${res.statusCode} ${res.body}`);
  return res.json();
}

export function verify(app: FastifyInstance, body: object, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/siws/verify',
    headers: { origin: AUTH_ORIGIN, 'content-type': 'application/json', ...headers },
    payload: JSON.stringify(body),
  });
}

/** Full happy-path sign-in; returns the session cookie value. */
export async function signIn(app: FastifyInstance, wallet: Wallet = newWallet()) {
  const { nonce, input } = await getNonce(app);
  const res = await verify(app, signVerifyBody(wallet, siwsText(input, wallet.address), nonce));
  if (res.statusCode !== 200) throw new Error(`verify: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'wl_session');
  if (!cookie) throw new Error('no session cookie');
  return { wallet, token: cookie.value, res };
}
