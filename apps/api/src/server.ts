import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createMetrics } from './lib/metrics.ts';
import { PostgresMarketRepository } from './markets/postgres.ts';
import { PostgresMediaRepository } from './media/postgres.ts';
import { RedisCacheStore } from './store/cache.ts';
import { createDb, createSql, PostgresUserRepository } from './store/postgres.ts';
import { createRedis, RedisEphemeralStore } from './store/redis.ts';
import { RedisXEnrichStore } from './x-feed/enrich.ts';

const config = loadConfig();
const metrics = createMetrics();

// Clients are created up front but connect lazily / in the background: the process boots and answers /health
// even when Postgres or Redis is down, and /ready says so.
const sql = createSql(config.databaseUrl, config.databasePoolMax);
let log: { warn(o: object, m: string): void; info(o: object, m: string): void } = console;
const redis = createRedis(config.redisUrl, 'main', { warn: (o, m) => log.warn(o, m), info: (o, m) => log.info(o, m) });
const rateLimitRedis =
  config.redisRateLimitUrl === config.redisUrl
    ? redis
    : createRedis(config.redisRateLimitUrl, 'ratelimit', {
        warn: (o, m) => log.warn(o, m),
        info: (o, m) => log.info(o, m),
      });

const db = createDb(sql);
const app = buildApp(config, {
  store: new RedisEphemeralStore(redis),
  repo: new PostgresUserRepository(db),
  markets: new PostgresMarketRepository(db),
  media: new PostgresMediaRepository(db),
  cache: new RedisCacheStore(redis),
  rateLimitRedis,
  xEnrichStore: new RedisXEnrichStore(redis),
  metrics,
  extraMetrics: () => {
    const clients =
      rateLimitRedis === redis
        ? [['main', redis] as const]
        : ([
            ['main', redis],
            ['ratelimit', rateLimitRedis],
          ] as const);
    return [
      '# HELP windle_pg_pool_max Configured Postgres pool size.',
      '# TYPE windle_pg_pool_max gauge',
      `windle_pg_pool_max ${config.databasePoolMax}`,
      '# HELP windle_redis_connected 1 if the ioredis client is in the ready state.',
      '# TYPE windle_redis_connected gauge',
      ...clients.map(
        ([name, client]) => `windle_redis_connected{client="${name}"} ${client.status === 'ready' ? 1 : 0}`,
      ),
    ];
  },
});
log = app.log;

app.addHook('onClose', async () => {
  await Promise.allSettled([
    sql.end({ timeout: 5 }),
    redis.quit(),
    rateLimitRedis === redis ? Promise.resolve() : rateLimitRedis.quit(),
  ]);
});

let closing = false;
async function shutdown(signal: NodeJS.Signals) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  // Hard stop if draining hangs; compose gives us stop_grace_period 20s.
  setTimeout(() => {
    app.log.error('shutdown timed out, exiting');
    process.exit(1);
  }, 15_000).unref();
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'shutdown failed');
    process.exit(1);
  }
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  app.log.fatal({ err }, 'uncaught exception');
  process.exit(1);
});

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { env: config.env, siwsDomain: config.siws.domain, corsOrigins: config.corsOrigins.length },
    'windle api listening',
  );
} catch (err) {
  app.log.fatal(err, 'failed to start');
  process.exit(1);
}
