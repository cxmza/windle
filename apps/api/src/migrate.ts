// Explicit deploy step: applies pending SQL migrations from ./drizzle, then exits. Never run implicitly at api start
// (the runtime role has no DDL rights, two replicas could race, and a bad migration must not crash-loop the service).
//
//   node dist/migrate.js                  (image: docker compose run --rm api node dist/migrate.js)
//   npm run db:migrate -w @windle/api     (from a checkout, via tsx)
//
// Uses DATABASE_MIGRATION_URL (owner role with DDL) and falls back to DATABASE_URL.
import { fileURLToPath } from 'node:url';
import { runMigrations } from './db/migrator.ts';

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ msg: 'migrate: DATABASE_MIGRATION_URL (or DATABASE_URL) is required' }));
  process.exit(2);
}
const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../drizzle', import.meta.url));

const started = Date.now();
try {
  const applied = await runMigrations(url, migrationsFolder);
  console.log(
    JSON.stringify({ msg: 'migrations applied', total: applied, ms: Date.now() - started, migrationsFolder }),
  );
} catch (err) {
  console.error(JSON.stringify({ msg: 'migration failed', error: (err as Error).message }));
  process.exit(1);
}
