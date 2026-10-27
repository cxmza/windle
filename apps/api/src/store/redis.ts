import { SiwsSignInInput } from '@windle/shared';
import { Redis } from 'ioredis';
import { z } from 'zod';
import type { EphemeralStore, SessionRecord } from './types.ts';

const NONCE_PREFIX = 'wl:siws:nonce:';
const SESSION_PREFIX = 'wl:sess:';
const LEASE_PREFIX = 'wl:lease:';

// Renew only our own lease (a plain PEXPIRE could extend a lease another instance took after ours expired).
const RENEW_LEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end
return 0`;
const RELEASE_LEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
return 0`;

const SessionRecordSchema = z.object({
  userId: z.string(),
  address: z.string(),
  method: z.literal('siws'),
  createdAt: z.number(),
}) satisfies z.ZodType<SessionRecord>;

export interface RedisLogger {
  warn(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
}

/**
 * ioredis client tuned for a request path: no offline queue (a command while disconnected fails at once instead of
 * hanging the request), one retry per command, background reconnect with capped backoff. The process never crashes
 * on a Redis outage; /ready reports it.
 */
export function createRedis(url: string, name: string, log: RedisLogger): Redis {
  const client = new Redis(url, {
    connectionName: `windle-api:${name}`,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
  });
  let lastWarn = 0;
  client.on('error', (err: Error) => {
    // Reconnect loops emit an error per attempt; log at most every 30s.
    const now = Date.now();
    if (now - lastWarn > 30_000) {
      lastWarn = now;
      log.warn({ err: { message: err.message }, redis: name }, 'redis error');
    }
  });
  client.on('ready', () => log.info({ redis: name }, 'redis ready'));
  return client;
}

export class RedisEphemeralStore implements EphemeralStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async putNonce(nonce: string, input: SiwsSignInInput, ttlSeconds: number) {
    const ok = await this.redis.set(NONCE_PREFIX + nonce, JSON.stringify(input), 'EX', ttlSeconds, 'NX');
    return ok === 'OK';
  }

  async takeNonce(nonce: string) {
    // GETDEL (Redis >= 6.2) is the single-use guarantee: of two concurrent verifies only one gets the value.
    const raw = await this.redis.getdel(NONCE_PREFIX + nonce);
    if (raw === null) return null;
    const parsed = SiwsSignInInput.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async putSession(hash: string, record: SessionRecord, ttlSeconds: number) {
    await this.redis.set(SESSION_PREFIX + hash, JSON.stringify(record), 'EX', ttlSeconds);
  }

  async getSession(hash: string) {
    const raw = await this.redis.get(SESSION_PREFIX + hash);
    if (raw === null) return null;
    const parsed = SessionRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async touchSession(hash: string, ttlSeconds: number) {
    await this.redis.expire(SESSION_PREFIX + hash, ttlSeconds);
  }

  async deleteSession(hash: string) {
    await this.redis.del(SESSION_PREFIX + hash);
  }

  async acquireLease(key: string, owner: string, ttlMs: number) {
    const taken = await this.redis.set(LEASE_PREFIX + key, owner, 'PX', ttlMs, 'NX');
    if (taken === 'OK') return true;
    const renewed = await this.redis.eval(RENEW_LEASE, 1, LEASE_PREFIX + key, owner, String(ttlMs));
    return renewed === 1;
  }

  async releaseLease(key: string, owner: string) {
    await this.redis.eval(RELEASE_LEASE, 1, LEASE_PREFIX + key, owner);
  }

  async ping() {
    await this.redis.ping();
  }
}
