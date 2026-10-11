import { type AuthProvider, SESSION_COOKIE } from '@windle/shared';
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

  /** Bearer token that unlocks /metrics from outside the host. Without it /metrics is internal-only. */
  METRICS_TOKEN: optionalString.pipe(z.string().min(32).optional()),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(16_384),
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
  };
}
