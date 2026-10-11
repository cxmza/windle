import type { Me } from '@windle/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.ts';
import { uuidv7 } from '../lib/crypto.ts';
import type { RevokeReason, SessionAuditEntry, UserRepository } from './types.ts';

export type Db = PostgresJsDatabase<typeof schema>;

/** postgres.js pool. Connections open lazily, so the api boots (and answers /health) with the database down. */
export function createSql(url: string, max: number) {
  return postgres(url, {
    max,
    idle_timeout: 30,
    max_lifetime: 60 * 30,
    connect_timeout: 5,
    connection: { application_name: 'windle-api' },
    onnotice: () => {},
  });
}

export function createDb(client: postgres.Sql): Db {
  return drizzle(client, { schema });
}

/** Thrown inside the transaction to roll back a lost first-sign-in race; the retry then finds the winner's row. */
class WalletRace extends Error {}

export class PostgresUserRepository implements UserRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async upsertWalletUser(address: string, now: Date) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.transaction(async (tx) => {
          const [existing] = await tx
            .update(schema.wallets)
            .set({ lastSeen: now })
            .where(and(eq(schema.wallets.chain, 'solana'), eq(schema.wallets.address, address)))
            .returning({ userId: schema.wallets.userId });
          if (existing) return { userId: existing.userId, created: false };

          const userId = uuidv7(now.getTime());
          await tx.insert(schema.users).values({ id: userId, createdAt: now });
          const inserted = await tx
            .insert(schema.wallets)
            .values({ chain: 'solana', address, userId, firstSeen: now, lastSeen: now })
            .onConflictDoNothing()
            .returning({ userId: schema.wallets.userId });
          // A concurrent first sign-in with the same wallet won: drop our user row with the transaction.
          if (inserted.length === 0) throw new WalletRace();
          return { userId, created: true };
        });
      } catch (err) {
        if (err instanceof WalletRace && attempt === 0) continue;
        throw err;
      }
    }
  }

  async getMe(userId: string): Promise<Me | null> {
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!user) return null;
    const rows = await this.db
      .select({ address: schema.wallets.address, firstSeen: schema.wallets.firstSeen })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, userId))
      .orderBy(asc(schema.wallets.firstSeen));
    return {
      id: user.id,
      createdAt: user.createdAt.toISOString(),
      wallets: rows.map((w) => ({ chain: 'solana' as const, address: w.address, linkedAt: w.firstSeen.toISOString() })),
    };
  }

  async recordSessionCreated(entry: SessionAuditEntry) {
    await this.db.insert(schema.sessionsAudit).values({
      sessionHash: entry.sessionHash,
      userId: entry.userId,
      method: entry.method,
      walletAddress: entry.walletAddress,
      ip: entry.ip,
      userAgent: entry.userAgent?.slice(0, 512) ?? null,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    });
  }

  async recordSessionRevoked(sessionHash: string, at: Date, reason: RevokeReason) {
    await this.db
      .update(schema.sessionsAudit)
      .set({ revokedAt: at, revokeReason: reason })
      .where(and(eq(schema.sessionsAudit.sessionHash, sessionHash), isNull(schema.sessionsAudit.revokedAt)));
  }

  async ping() {
    await this.db.execute(sql`select 1`);
  }
}
