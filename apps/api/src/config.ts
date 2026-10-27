import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AuthProvider, SESSION_COOKIE, SolanaAddress } from '@windle/shared';
import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])
    .optional()
    .transform((v) => (v === undefined ? fallback : ['true', '1', 'yes', 'on'].includes(v)));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    v === undefined
      ? undefined
      : v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
  );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Optional build identifier (git sha) shown on GET /. */
  APP_COMMIT: optionalString,

  /** Hops whose X-Forwarded-For / X-Real-IP / CF-Connecting-IP are believed: IPs or CIDRs. */
  TRUST_PROXY: csv,

  DATABASE_URL: optionalString,
  /** Owner role used only by `node dist/migrate.js` (falls back to DATABASE_URL). */
  DATABASE_MIGRATION_URL: optionalString,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: optionalString,
  /** Separate logical db for rate-limit counters (falls back to REDIS_URL). */
  REDIS_RATE_LIMIT_URL: optionalString,

  CORS_ALLOWED_ORIGINS: csv,
  PUBLIC_API_ORIGIN: optionalString,
  /** Origin of the sign-in app; the default SIWS uri/domain derive from it. */
  PUBLIC_AUTH_ORIGIN: optionalString,
  PUBLIC_DOCS_ORIGIN: optionalString,
  /** Origin of the product app; share links and the share page's redirect point here. */
  PUBLIC_APP_ORIGIN: optionalString,

  /** Fixed by the shared contract (SESSION_COOKIE); accepted only so a mismatching value fails loudly. */
  SESSION_COOKIE_NAME: optionalString,
  /**
   * Accepted for infra compatibility, currently unused: sessions are opaque 256-bit tokens looked up server-side, so
   * there is nothing to sign. Reserved for future signed cookies (e.g. OAuth state).
   */
  COOKIE_SECRET: optionalString,
  SESSION_COOKIE_DOMAIN: optionalString,
  SESSION_COOKIE_SECURE: z.enum(['true', 'false', '1', '0']).optional(),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .default(30 * 24 * 3600),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .default(90 * 24 * 3600),

  SIWS_DOMAIN: optionalString,
  SIWS_URI: optionalString,
  SIWS_STATEMENT: z.string().default('Sign in to windle'),
  SIWS_CHAIN_ID: z.enum(['mainnet', 'devnet', 'testnet']).default('mainnet'),
  SIWS_NONCE_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

  AUTH_SIWS_ENABLED: bool(true),
  AUTH_EMAIL_ENABLED: bool(false),
  AUTH_X_ENABLED: bool(false),
  AUTH_GOOGLE_ENABLED: bool(false),
  AUTH_TELEGRAM_ENABLED: bool(false),
  AUTH_DISCORD_ENABLED: bool(false),
  EMAIL_FROM: optionalString,
  SMTP_URL: optionalString,
  X_CLIENT_ID: optionalString,
  X_CLIENT_SECRET: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  DISCORD_CLIENT_ID: optionalString,
  DISCORD_CLIENT_SECRET: optionalString,

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),

  /** Origin of the public CDN that serves signed image URLs (host nginx -> imgproxy). */
  PUBLIC_CDN_ORIGIN: optionalString,
  /** imgproxy signing key/salt (hex; the first pair when a comma-separated rotation pair is set). Same as imgproxy.env. */
  IMGPROXY_KEY: optionalString,
  IMGPROXY_SALT: optionalString,
  /** Where uploaded masters live (<root>/<id[0:2]>/<id>.webp). imgproxy mounts the same directory read-only. */
  MEDIA_ROOT: optionalString,
  /** Sum of active masters on disk; uploads beyond it get 507 media_storage_full. */
  MEDIA_MAX_TOTAL_BYTES: z.coerce
    .number()
    .int()
    .min(1_000_000)
    .default(15 * 1024 ** 3),
  /** Uploads one user may make per 24 hours (every attempt counts: processing is the cost). */
  MEDIA_UPLOADS_PER_DAY: z.coerce.number().int().min(1).max(10_000).default(40),
  /** Uploads one user may make per minute. */
  MEDIA_UPLOADS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(6),
  /** Images processed at once (sharp, one libvips thread each) and uploads allowed to wait for a slot. */
  MEDIA_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(1),
  MEDIA_MAX_QUEUE: z.coerce.number().int().min(0).max(1000).default(16),
  /**
   * Format pinned into the preset URLs. `webp`: one variant per URL, so Cloudflare caches it at the edge. `auto`:
   * AVIF/WebP/JPEG by Accept at nginx/imgproxy, but Cloudflare must not cache it (it ignores Vary: Accept).
   */
  MEDIA_URL_FORMAT: z.enum(['webp', 'auto']).default('webp'),
  /** Optional Cloudflare purge-by-URL on takedown (token with Zone.Cache Purge). Without them: purge manually. */
  CF_ZONE_ID: optionalString,
  CF_API_TOKEN: optionalString,

  /** Bearer token that unlocks /metrics from outside the host. Without it /metrics is internal-only. */
  METRICS_TOKEN: optionalString.pipe(z.string().min(32).optional()),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(16_384),

  /** services/x-relay (loopback HTTP); in compose: http://x-relay:3010. */
  X_RELAY_URL: optionalString,
  /** Concurrent GET /v1/x/stream connections: whole process / one client IP. */
  X_FEED_MAX_STREAMS: z.coerce.number().int().min(1).max(100_000).default(1000),
  X_FEED_MAX_STREAMS_PER_IP: z.coerce.number().int().min(1).max(1000).default(8),

  /** twitterapi.io key for on-demand post enrichment (GET /v1/x/post/:id?enrich=1). Absent: enrichment is off. */
  TWITTERAPI_IO_KEY: optionalString,
  TWITTERAPI_BASE_URL: z.string().default('https://api.twitterapi.io'),
  /** Credits the api may spend on twitterapi.io per UTC day (a tweet lookup is ~15, an article ~100). */
  TWITTERAPI_DAILY_BUDGET: z.coerce.number().int().min(0).default(50_000),
  /** Upstream enrich lookups per client IP per minute (cache hits are not counted). */
  X_ENRICH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(30),

  /** Wallets that may resolve any market (comma-separated base58 addresses; empty = only creators resolve). */
  ADMIN_WALLETS: csv,
  /** Markets one user may create per hour. */
  MARKET_CREATE_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(5),
  /** Trades one user may place per minute. */
  MARKET_TRADE_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(60),
  /** How long the leaderboard's top list is cached (Redis), in seconds. */
  LEADERBOARD_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).default(15),
  /** How long a market's candles are cached (Redis), in seconds; 0 turns the cache off. */
  CANDLES_CACHE_SECONDS: z.coerce.number().int().min(0).max(60).default(3),

  /** House market bots (markets/bots): open, labelled liquidity traders. Off unless switched on. */
  BOTS_ENABLED: bool(false),
  /** Mean time between bot ticks; each tick waits 0.75x..1.25x of it. */
  BOTS_TICK_MS: z.coerce.number().int().min(1000).max(3_600_000).default(20_000),
  /** OU mean reversion θ per hour (2 = half-life ~21 min, time constant 30 min). */
  BOTS_THETA_PER_HOUR: z.coerce.number().positive().max(1000).default(2),
  /** OU volatility σ in log-odds per sqrt(hour). */
  BOTS_SIGMA: z.coerce.number().min(0).max(10).default(0.25),
  /** EMA weight with which each human trade pulls the anchor toward its post-trade price. */
  BOTS_ANCHOR_ALPHA: z.coerce.number().min(0).max(1).default(0.5),
  /** Rate per hour at which the anchor relaxes the rest of the way to the last human price. */
  BOTS_ANCHOR_FOLLOW_PER_HOUR: z.coerce.number().min(0).max(1000).default(1),
  /** Largest bot buy, in points. */
  BOTS_MAX_STAKE_PTS: z.coerce.number().min(1).max(100_000).default(25),
  /** Largest price move of one bot trade, in percentage points. */
  BOTS_MAX_STEP_PP: z.coerce.number().positive().max(50).default(3),
  /** No bot trade while the price is within this many percentage points of the bot's target. */
  BOTS_DEAD_BAND_PP: z.coerce.number().min(0).max(50).default(1),
  /** Number of bot accounts ("Market bot #1".."#n"). */
  BOTS_COUNT: z.coerce.number().int().min(1).max(9).default(4),
  /** Open markets a tick looks at (a random subset). */
  BOTS_MARKETS_PER_TICK: z.coerce.number().int().min(1).max(100).default(3),
  /** Bots leave a market alone in its last minutes before the deadline (at most the last 10 % of its run). */
  BOTS_QUIET_BEFORE_CLOSE_MINUTES: z.coerce.number().min(0).max(10_080).default(30),
});

type RawEnv = z.infer<typeof Env>;

const PROD_ORIGINS = [
  'https://www.windle.fun',
  'https://app.windle.fun',
  'https://oauth.windle.fun',
  'https://docs.windle.fun',
];
// web 5173, app 5174, auth 5175, docs 4321 (astro), vite preview of the same ports.
const DEV_ORIGINS = [5173, 5174, 5175, 5176, 4321].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

export interface Config {
  env: RawEnv['NODE_ENV'];
  isProd: boolean;
  host: string;
  port: number;
  logLevel: RawEnv['LOG_LEVEL'];
  commit: string | undefined;
  trustProxy: string[];
  databaseUrl: string;
  databaseMigrationUrl: string;
  databasePoolMax: number;
  redisUrl: string;
  redisRateLimitUrl: string;
  corsOrigins: string[];
  publicApiOrigin: string;
  publicDocsOrigin: string;
  publicAppOrigin: string;
  cookie: { domain: string | undefined; secure: boolean };
  session: { ttlSeconds: number; absoluteTtlSeconds: number };
  siws: {
    domain: string;
    uri: string;
    statement: string;
    chainId: RawEnv['SIWS_CHAIN_ID'];
    nonceTtlSeconds: number;
  };
  providers: Record<AuthProvider, boolean>;
  rateLimit: { max: number; authMax: number; windowSeconds: number };
  metricsToken: string | undefined;
  bodyLimit: number;
  xFeed: { relayUrl: string; maxStreams: number; maxStreamsPerIp: number };
  xEnrich: { apiKey: string | undefined; baseUrl: string; dailyBudget: number; ratePerMinute: number };
  markets: {
    adminWallets: ReadonlySet<string>;
    createPerHour: number;
    tradePerMinute: number;
    leaderboardCacheSeconds: number;
    candlesCacheSeconds: number;
  };
  bots: BotsConfig;
  media: MediaConfig;
}

export interface MediaConfig {
  root: string;
  cdnOrigin: string;
  /** Hex strings; empty in dev/test without IMGPROXY_KEY (URLs are then signed with an empty key, never served). */
  imgproxyKey: string;
  imgproxySalt: string;
  maxTotalBytes: number;
  uploadsPerDay: number;
  uploadsPerMinute: number;
  maxConcurrent: number;
  maxQueue: number;
  urlFormat: 'webp' | 'auto';
  cloudflare: { zoneId: string; apiToken: string } | null;
}

export interface BotsConfig {
  enabled: boolean;
  tickMs: number;
  thetaPerHour: number;
  sigma: number;
  anchorAlpha: number;
  anchorFollowPerHour: number;
  maxStakePts: number;
  /** Probability points (0.03 = 3 pp). */
  maxStep: number;
  /** Probability points. */
  deadBand: number;
  count: number;
  marketsPerTick: number;
  quietBeforeCloseMs: number;
}

/** Validates the environment once at startup; a bad value fails fast with every issue listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  const problems: string[] = [];

  if (isProd && !e.DATABASE_URL) problems.push('DATABASE_URL is required in production');
  if (isProd && !e.REDIS_URL) problems.push('REDIS_URL is required in production');
  if (e.SESSION_ABSOLUTE_TTL_SECONDS < e.SESSION_TTL_SECONDS)
    problems.push('SESSION_ABSOLUTE_TTL_SECONDS must be >= SESSION_TTL_SECONDS');
  // Providers can only be switched on together with their real credentials (no fake keys).
  if (e.AUTH_EMAIL_ENABLED && !(e.EMAIL_FROM && e.SMTP_URL))
    problems.push('AUTH_EMAIL_ENABLED needs EMAIL_FROM and SMTP_URL');
  if (e.AUTH_X_ENABLED && !(e.X_CLIENT_ID && e.X_CLIENT_SECRET))
    problems.push('AUTH_X_ENABLED needs X_CLIENT_ID and X_CLIENT_SECRET');
  if (e.AUTH_GOOGLE_ENABLED && !(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET))
    problems.push('AUTH_GOOGLE_ENABLED needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  if (e.AUTH_TELEGRAM_ENABLED && !e.TELEGRAM_BOT_TOKEN) problems.push('AUTH_TELEGRAM_ENABLED needs TELEGRAM_BOT_TOKEN');
  if (e.AUTH_DISCORD_ENABLED && !(e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET))
    problems.push('AUTH_DISCORD_ENABLED needs DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET');

  const corsOrigins = e.CORS_ALLOWED_ORIGINS ?? (isProd ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS]);
  for (const origin of corsOrigins) {
    if (origin === '*' || !URL.canParse(origin) || new URL(origin).origin !== origin)
      problems.push(`CORS_ALLOWED_ORIGINS: "${origin}" is not an exact origin (scheme://host[:port])`);
  }

  if (e.SESSION_COOKIE_NAME !== undefined && e.SESSION_COOKIE_NAME !== SESSION_COOKIE)
    problems.push(`SESSION_COOKIE_NAME must be "${SESSION_COOKIE}" (fixed by @windle/shared) or unset`);

  const siwsUri = e.SIWS_URI ?? e.PUBLIC_AUTH_ORIGIN ?? (isProd ? 'https://oauth.windle.fun' : 'http://localhost:5175');
  if (!URL.canParse(siwsUri)) problems.push('SIWS_URI must be an absolute URL');
  const siwsDomain = e.SIWS_DOMAIN ?? (URL.canParse(siwsUri) ? new URL(siwsUri).host : '');

  const cookieSecure = e.SESSION_COOKIE_SECURE === undefined ? isProd : ['true', '1'].includes(e.SESSION_COOKIE_SECURE);
  if (isProd && !cookieSecure) problems.push('SESSION_COOKIE_SECURE cannot be false in production');

  const relayUrl = e.X_RELAY_URL ?? 'http://127.0.0.1:3010';
  if (!URL.canParse(relayUrl) || !['http:', 'https:'].includes(new URL(relayUrl).protocol))
    problems.push('X_RELAY_URL must be an absolute http(s) URL');

  if (!URL.canParse(e.TWITTERAPI_BASE_URL) || new URL(e.TWITTERAPI_BASE_URL).protocol !== 'https:')
    problems.push('TWITTERAPI_BASE_URL must be an absolute https URL');

  const adminWallets = e.ADMIN_WALLETS ?? [];
  for (const wallet of adminWallets) {
    if (!SolanaAddress.safeParse(wallet).success)
      problems.push(`ADMIN_WALLETS: "${wallet}" is not a base58 Solana address`);
  }

  const appOrigin = e.PUBLIC_APP_ORIGIN ?? (isProd ? 'https://app.windle.fun' : 'http://localhost:5174');
  if (!URL.canParse(appOrigin) || new URL(appOrigin).origin !== appOrigin)
    problems.push('PUBLIC_APP_ORIGIN must be an exact origin (scheme://host[:port])');

  if (e.BOTS_DEAD_BAND_PP >= e.BOTS_MAX_STEP_PP) problems.push('BOTS_DEAD_BAND_PP must be below BOTS_MAX_STEP_PP');

  const imgproxyKey = e.IMGPROXY_KEY?.split(',')[0]?.trim() ?? '';
  const imgproxySalt = e.IMGPROXY_SALT?.split(',')[0]?.trim() ?? '';
  for (const [name, value] of [
    ['IMGPROXY_KEY', imgproxyKey],
    ['IMGPROXY_SALT', imgproxySalt],
  ] as const) {
    if (isProd && value === '') problems.push(`${name} is required in production (same value as imgproxy.env)`);
    if (value !== '' && !/^(?:[0-9a-fA-F]{2})+$/.test(value)) problems.push(`${name} must be hex`);
  }
  const cdnOrigin = e.PUBLIC_CDN_ORIGIN ?? 'https://cdn.windle.fun';
  if (!URL.canParse(cdnOrigin) || new URL(cdnOrigin).origin !== cdnOrigin)
    problems.push('PUBLIC_CDN_ORIGIN must be an exact origin (scheme://host[:port])');
  if ((e.CF_ZONE_ID === undefined) !== (e.CF_API_TOKEN === undefined))
    problems.push('CF_ZONE_ID and CF_API_TOKEN go together (or neither)');

  if (problems.length > 0) throw new Error(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

  const databaseUrl = e.DATABASE_URL ?? 'postgres://windle:windle@127.0.0.1:5432/windle';
  const redisUrl = e.REDIS_URL ?? 'redis://127.0.0.1:6379/0';
  return {
    env: e.NODE_ENV,
    isProd,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    commit: e.APP_COMMIT,
    // Loopback (host nginx, bare-metal run) + the docker bridge range (nginx -> published port -> container: the
    // peer is the bridge gateway). Only processes on the host can reach the 127.0.0.1-published port.
    trustProxy: e.TRUST_PROXY ?? ['127.0.0.1', '::1', '172.16.0.0/12'],
    databaseUrl,
    databaseMigrationUrl: e.DATABASE_MIGRATION_URL ?? databaseUrl,
    databasePoolMax: e.DATABASE_POOL_MAX,
    redisUrl,
    redisRateLimitUrl: e.REDIS_RATE_LIMIT_URL ?? redisUrl,
    corsOrigins,
    publicApiOrigin: e.PUBLIC_API_ORIGIN ?? (isProd ? 'https://api.windle.fun' : `http://localhost:${e.PORT}`),
    publicDocsOrigin: e.PUBLIC_DOCS_ORIGIN ?? 'https://docs.windle.fun',
    publicAppOrigin: appOrigin,
    cookie: { domain: e.SESSION_COOKIE_DOMAIN ?? (isProd ? '.windle.fun' : undefined), secure: cookieSecure },
    session: { ttlSeconds: e.SESSION_TTL_SECONDS, absoluteTtlSeconds: e.SESSION_ABSOLUTE_TTL_SECONDS },
    siws: {
      domain: siwsDomain,
      uri: siwsUri,
      statement: e.SIWS_STATEMENT,
      chainId: e.SIWS_CHAIN_ID,
      nonceTtlSeconds: e.SIWS_NONCE_TTL_SECONDS,
    },
    providers: {
      siws: e.AUTH_SIWS_ENABLED,
      email: e.AUTH_EMAIL_ENABLED,
      x: e.AUTH_X_ENABLED,
      google: e.AUTH_GOOGLE_ENABLED,
      telegram: e.AUTH_TELEGRAM_ENABLED,
      discord: e.AUTH_DISCORD_ENABLED,
    },
    rateLimit: { max: e.RATE_LIMIT_MAX, authMax: e.RATE_LIMIT_AUTH_MAX, windowSeconds: e.RATE_LIMIT_WINDOW_SECONDS },
    metricsToken: e.METRICS_TOKEN,
    bodyLimit: e.BODY_LIMIT_BYTES,
    xFeed: { relayUrl, maxStreams: e.X_FEED_MAX_STREAMS, maxStreamsPerIp: e.X_FEED_MAX_STREAMS_PER_IP },
    xEnrich: {
      apiKey: e.TWITTERAPI_IO_KEY,
      baseUrl: e.TWITTERAPI_BASE_URL,
      dailyBudget: e.TWITTERAPI_DAILY_BUDGET,
      ratePerMinute: e.X_ENRICH_RATE_LIMIT_PER_MINUTE,
    },
    markets: {
      adminWallets: new Set(adminWallets),
      createPerHour: e.MARKET_CREATE_PER_HOUR,
      tradePerMinute: e.MARKET_TRADE_PER_MINUTE,
      leaderboardCacheSeconds: e.LEADERBOARD_CACHE_SECONDS,
      candlesCacheSeconds: e.CANDLES_CACHE_SECONDS,
    },
    bots: {
      enabled: e.BOTS_ENABLED,
      tickMs: e.BOTS_TICK_MS,
      thetaPerHour: e.BOTS_THETA_PER_HOUR,
      sigma: e.BOTS_SIGMA,
      anchorAlpha: e.BOTS_ANCHOR_ALPHA,
      anchorFollowPerHour: e.BOTS_ANCHOR_FOLLOW_PER_HOUR,
      maxStakePts: e.BOTS_MAX_STAKE_PTS,
      maxStep: e.BOTS_MAX_STEP_PP / 100,
      deadBand: e.BOTS_DEAD_BAND_PP / 100,
      count: e.BOTS_COUNT,
      marketsPerTick: e.BOTS_MARKETS_PER_TICK,
      quietBeforeCloseMs: e.BOTS_QUIET_BEFORE_CLOSE_MINUTES * 60_000,
    },
    media: {
      root: e.MEDIA_ROOT ?? (isProd ? '/srv/windle/media' : join(tmpdir(), 'windle-media')),
      cdnOrigin,
      imgproxyKey,
      imgproxySalt,
      maxTotalBytes: e.MEDIA_MAX_TOTAL_BYTES,
      uploadsPerDay: e.MEDIA_UPLOADS_PER_DAY,
      uploadsPerMinute: e.MEDIA_UPLOADS_PER_MINUTE,
      maxConcurrent: e.MEDIA_MAX_CONCURRENT,
      maxQueue: e.MEDIA_MAX_QUEUE,
      urlFormat: e.MEDIA_URL_FORMAT,
      cloudflare: e.CF_ZONE_ID && e.CF_API_TOKEN ? { zoneId: e.CF_ZONE_ID, apiToken: e.CF_API_TOKEN } : null,
    },
  };
}
