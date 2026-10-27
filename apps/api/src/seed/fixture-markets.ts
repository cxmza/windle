import { createHash } from 'node:crypto';
import { type Collateral, type MarketTier, type TweetSnapshot, tweetUrl } from '@windle/shared';
import { insertMarket } from '../markets/service.ts';
import type { MarketRepository } from '../markets/types.ts';

/**
 * The OPEN markets of apps/app/src/features/predict/fixtures.ts (same slugs, texts, liquidity and opening odds),
 * seeded as fresh server markets: LMSR state from the opening odds only, zero volume, no trades, no resolved or
 * closed markets. Deadlines are relative to the seed run, as the fixtures are relative to their epoch.
 * The tweets are the app's sample tweets (invented), not real X posts.
 */

const HOUR = 3_600_000;

/** Seeded markets belong to this user. It has no wallet, so nobody can sign in as it. */
export const SYSTEM_USER_ID = '00000000-0000-7000-8000-000000000001';
/** Shown as `creator` of seeded markets: base58(sha256("windle:system-creator")), a key nobody holds. */
export const SYSTEM_CREATOR_ADDRESS = 'HGu1EJNBc6n8QZHWLqVbn1w6FRZQevcCJ94wkECGbKbM';

interface FixtureMarket {
  slug: string;
  tier: MarketTier;
  name: string;
  ticker: string;
  handle: string;
  author: string;
  verified: boolean;
  tweet: string;
  statement: string;
  criteria: string;
  probPct: number;
  b: number;
  inHours: number;
  /** Hours between the tweet and the seed run. */
  tweetAgeHours: number;
  collateral?: Collateral;
}

const backed = (
  slug: string,
  name: string,
  ticker: string,
  handle: string,
  promise: string,
  check: string,
  probPct: number,
  collateralSol: number,
  inHours: number,
  b: number,
  spanHours: number,
): FixtureMarket => ({
  slug,
  tier: 'backed',
  name,
  ticker,
  handle,
  author: name,
  verified: true,
  tweet: `${promise} ${collateralSol} SOL is locked behind it and the check is onchain.`,
  statement: promise,
  criteria: check,
  probPct,
  b,
  inHours,
  tweetAgeHours: spanHours,
  collateral: { amountSol: collateralSol, check },
});

export const FIXTURE_MARKETS: readonly FixtureMarket[] = [
  backed(
    'kestrel-v2-vaults',
    'Kestrel Protocol',
    'KSTL',
    'kestrel_hq',
    'Ship v2 vaults with a live withdrawal queue on mainnet.',
    'Program KSTL…q7Vr upgraded to v2 and `init_queue` executed at least once on mainnet.',
    72,
    380,
    5,
    80,
    330,
  ),
  backed(
    'basalt-crafting',
    'Basalt Games',
    'BSLT',
    'basaltgames_dev',
    'Mint the season-one item set and turn on onchain crafting.',
    'Collection BSLT…S1 holds ≥ 120 items and the `craft` instruction succeeds in a mainnet transaction.',
    77,
    210,
    14,
    60,
    280,
  ),
  backed(
    'quiet-harbor-multisig',
    'Quiet Harbor',
    'QHBR',
    'quietharbor_dao',
    'Move the treasury under a 4-of-7 multisig.',
    'Treasury authority of QHBR…tR3a changes to a multisig account with threshold 4 of 7 signers.',
    88,
    55,
    30,
    40,
    240,
  ),
  backed(
    'orrery-verified-build',
    'Orrery Finance',
    'ORRY',
    'orreryfinance',
    'Open-source the oracle aggregator and verify the build onchain.',
    'Verified-build record for program ORRY…m2Kd matches the public repository tag v1.0.0.',
    41,
    150,
    51,
    50,
    300,
  ),
  backed(
    'fennel-fee-switch',
    'Fennel DAO',
    'FNL',
    'fennel_dao',
    'Pass and execute governance proposal #12: the fee switch.',
    'Proposal #12 in realm FNL…dao8 reaches the Executed state before the deadline.',
    49,
    300,
    96,
    70,
    360,
  ),
  backed(
    'tidewater-depositors',
    'Tidewater',
    'TIDE',
    'tidewater_fi',
    'Reach 1,000 unique depositors in the Tidewater pool.',
    'Pool TIDE…p00L records at least 1,000 distinct depositor accounts.',
    58,
    640,
    216,
    100,
    400,
  ),
  backed(
    'lumen-payments-sdk',
    'Lumen Relay',
    'LMNR',
    'lumenrelay',
    'Launch the payments SDK with five integrating programs.',
    'At least 5 distinct programs invoke LMNR…pAy1 `pay` through CPI on mainnet.',
    33,
    90,
    504,
    50,
    220,
  ),
  backed(
    'northline-collateral',
    'Northline',
    'NRTH',
    'northline_labs',
    'Open lending markets for three new collateral types.',
    'Lending program NRTH…L3nd lists 3 new reserve accounts with deposits enabled.',
    22,
    820,
    816,
    100,
    380,
  ),
  backed(
    'arclight-ticketing',
    'Arclight',
    'ARC',
    'arclight_tix',
    'Ship compressed ticketing and mint 10,000 tickets.',
    'Merkle tree ARC…tkT5 holds at least 10,000 minted leaves.',
    66,
    130,
    1320,
    60,
    260,
  ),
  {
    slug: 'sprout-staking-v2',
    tier: 'community',
    name: 'Sproutfi',
    ticker: 'SPRT',
    handle: 'sproutfi_dev',
    author: 'Sprout Finance',
    verified: true,
    tweet:
      'gm. staking v2 goes to mainnet this Friday. new reward curve, no lockup, withdrawals in one click. no more delays, we ship.',
    statement: 'Sprout deploys staking v2 to Solana mainnet by Friday.',
    criteria:
      'YES if the staking v2 program is deployed on Solana mainnet and announced by @sproutfi_dev before the deadline. Testnet or devnet deployments do not count.',
    probPct: 64,
    b: 50,
    inHours: 52,
    tweetAgeHours: 56,
  },
  {
    slug: 'moonpaw-cex-listing',
    tier: 'community',
    name: 'MoonPaw',
    ticker: 'PAW',
    handle: 'moonpaw_team',
    author: 'MoonPaw',
    verified: false,
    tweet:
      'CEX listing is confirmed for next week. we cannot name it yet but you will like it. dev is not selling, community first.',
    statement: 'PAW is listed on a top-20 centralized exchange within a week.',
    criteria:
      'YES if a PAW spot trading pair is live on an exchange ranked top 20 by spot volume on CoinGecko before the deadline. A DEX or a launchpad listing does not count.',
    probPct: 31,
    b: 40,
    inHours: 160,
    tweetAgeHours: 130,
  },
  {
    slug: 'bonkers-merch-store',
    tier: 'community',
    name: 'Bonkers',
    ticker: 'BNKR',
    handle: 'bonkers_cto',
    author: 'Bonkers CTO',
    verified: false,
    tweet: 'merch store opens in 10 days. hoodies, caps, the whole thing. holders get 20% off. screenshots coming.',
    statement: 'The Bonkers merch store opens to the public within 10 days.',
    criteria:
      'YES if a public storefront selling Bonkers merchandise is reachable without a whitelist and linked from the official @bonkers_cto account before the deadline.',
    probPct: 47,
    b: 40,
    inHours: 230,
    tweetAgeHours: 30,
  },
];

/** A stable 19-digit id per slug, shaped like a snowflake (the sample tweets have no real id). */
export function sampleTweetId(slug: string): string {
  const digest = createHash('sha256').update(`windle:sample-tweet:${slug}`).digest();
  let digits = '';
  for (const byte of digest) {
    digits += String(byte % 10);
    if (digits.length === 17) break;
  }
  return `18${digits}`;
}

function snapshotOf(f: FixtureMarket, now: number): TweetSnapshot {
  const id = sampleTweetId(f.slug);
  return {
    id,
    url: tweetUrl(f.handle, id),
    author: { handle: f.handle, name: f.author, ...(f.verified ? { verified: true } : {}) },
    text: f.tweet,
    createdAt: new Date(now - f.tweetAgeHours * HOUR).toISOString(),
    capturedAt: new Date(now).toISOString(),
  };
}

/** Idempotent: a slug that already exists is left untouched (never re-opened or re-priced). */
export async function seedFixtureMarkets(
  repo: MarketRepository,
  now: Date,
): Promise<{ inserted: string[]; skipped: string[] }> {
  await repo.ensureUser(SYSTEM_USER_ID, now);
  const inserted: string[] = [];
  const skipped: string[] = [];
  for (const f of FIXTURE_MARKETS) {
    const { inserted: added } = await insertMarket(
      repo,
      {
        statement: f.statement,
        criteria: f.criteria,
        deadline: new Date(now.getTime() + f.inHours * HOUR).toISOString(),
        tier: f.tier,
        project: { name: f.name, ticker: f.ticker },
        initialProbYes: f.probPct / 100,
        liquidityB: f.b,
        collateral: f.collateral ?? null,
        source: snapshotOf(f, now.getTime()),
      },
      { userId: SYSTEM_USER_ID, address: SYSTEM_CREATOR_ADDRESS },
      now,
      { slug: f.slug },
    );
    (added ? inserted : skipped).push(f.slug);
  }
  return { inserted, skipped };
}
