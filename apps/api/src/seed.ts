// One-off deploy step: inserts the open sample markets (src/seed/fixture-markets.ts) for the system creator, then
// exits. Idempotent: markets whose slug exists are skipped, so running it twice changes nothing. DML only, so the
// api's own role (DATABASE_URL) is enough:
//
//   node dist/seed.js                                   (image: $DC --profile api run --rm --no-deps api node dist/seed.js)
//   npm run db:seed -w @windle/api                      (from a checkout, via tsx)
import { PostgresMarketRepository } from './markets/postgres.ts';
import { seedFixtureMarkets } from './seed/fixture-markets.ts';
import { createDb, createSql } from './store/postgres.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ msg: 'seed: DATABASE_URL is required' }));
  process.exit(2);
}

const sql = createSql(url, 1);
try {
  const result = await seedFixtureMarkets(new PostgresMarketRepository(createDb(sql)), new Date());
  console.log(JSON.stringify({ msg: 'seed done', inserted: result.inserted, skipped: result.skipped.length }));
} catch (err) {
  console.error(JSON.stringify({ msg: 'seed failed', error: (err as Error).message }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
