import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const LOCK_KEY = 0x77696e646c65; // "windle"

/**
 * Applies pending migrations from `migrationsFolder` under a session-level advisory lock (one connection, so the
 * lock and the DDL share a backend; a second concurrent runner waits instead of racing). Returns the number of
 * migrations recorded afterwards.
 */
export async function runMigrations(url: string, migrationsFolder: string): Promise<number> {
  const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(${LOCK_KEY}::bigint)`;
    try {
      await migrate(drizzle(sql), { migrationsFolder });
      const [row] = await sql<{ count: number }[]>`select count(*)::int as count from drizzle.__drizzle_migrations`;
      return row?.count ?? 0;
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_KEY}::bigint)`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
