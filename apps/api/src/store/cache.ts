import type { Redis } from 'ioredis';

/** A small TTL cache for derived values (leaderboard JSON, rendered share images). Losing it is always safe. */
export interface CacheStore {
  get(key: string): Promise<Buffer | null>;
  set(key: string, value: Buffer, ttlSeconds: number): Promise<void>;
}

const PREFIX = 'wl:cache:';

export class RedisCacheStore implements CacheStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get(key: string) {
    return this.redis.getBuffer(PREFIX + key);
  }

  async set(key: string, value: Buffer, ttlSeconds: number) {
    await this.redis.set(PREFIX + key, value, 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }
}

/** Bounded in-process cache (least recently used out first) against an injectable clock. */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, { value: Buffer; expiresAt: number }>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(opts: { maxEntries?: number; now?: () => number } = {}) {
    this.maxEntries = opts.maxEntries ?? 500;
    this.now = opts.now ?? Date.now;
  }

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return null;
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: Buffer, ttlSeconds: number) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
