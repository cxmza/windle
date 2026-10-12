import { createFixtureMarkets } from '../markets/fixtures';
import { projectSlug } from './model';
import type { ActivityEvent, ActivityKind, Outcome, PastPromise, Project } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Past = [statement: string, outcome: Outcome, daysAgo: number, collateralSol: number];
type Event = [kind: ActivityKind, text: string, hoursAgo: number, amountSol?: number];

interface Extra {
  summary: string;
  past: Past[];
  events: Event[];
}

const EXTRAS: Readonly<Record<string, Extra>> = {
  'kestrel-protocol': {
    summary: 'Lending vaults on Solana with an audited, upgradeable program.',
    past: [
      ['Publish the v1 vault audit and fix every high finding.', 'shipped', 41, 250],
      ['Open vaults to external depositors.', 'shipped', 96, 180],
      ['Ship the keeper bot for liquidations.', 'slashed', 150, 120],
    ],
    events: [
      ['trade', 'Ship +120 shares at 0.71', 0.4, 85],
      ['trade', 'Slash +40 shares at 0.29', 2, 12],
      ['promise', 'Locked 380 SOL behind the v2 vault promise', 70, 380],
      ['settlement', 'Keeper bot promise slashed; collateral paid out', 150 * 24, 120],
    ],
  },
  'basalt-games': {
    summary: 'A survival crafting game whose items live onchain.',
    past: [
      ['Release the open playtest build.', 'shipped', 33, 90],
      ['Ship the item marketplace.', 'slashed', 88, 160],
    ],
    events: [
      ['trade', 'Ship +60 shares at 0.76', 1.2, 46],
      ['trade', 'Slash +25 shares at 0.24', 6, 6],
      ['promise', 'Locked 210 SOL behind the season-one promise', 55, 210],
    ],
  },
  'quiet-harbor': {
    summary: 'A small treasury-management DAO moving to stricter custody.',
    past: [['Publish the first quarterly treasury report.', 'shipped', 62, 40]],
    events: [
      ['trade', 'Ship +200 shares at 0.88', 0.9, 176],
      ['promise', 'Locked 55 SOL behind the multisig promise', 120, 55],
      ['settlement', 'Treasury report promise shipped; collateral released', 62 * 24, 40],
    ],
  },
  'orrery-finance': {
    summary: 'Price oracles for long-tail Solana assets.',
    past: [
      ['Run the oracle on mainnet for 30 days without a stale feed.', 'slashed', 20, 140],
      ['Launch the public price API.', 'shipped', 74, 80],
    ],
    events: [
      ['trade', 'Slash +90 shares at 0.59', 0.6, 53],
      ['trade', 'Ship +30 shares at 0.41', 5, 12],
      ['promise', 'Locked 150 SOL behind the verified-build promise', 48, 150],
      ['settlement', 'Stale-feed promise slashed; collateral paid out', 20 * 24, 140],
    ],
  },
  'fennel-dao': {
    summary: 'A community-run DAO governing a shared fee pool.',
    past: [
      ['Pass the first governance charter.', 'shipped', 51, 120],
      ['Execute the grants round before quarter end.', 'slashed', 119, 200],
    ],
    events: [
      ['trade', 'Slash +70 shares at 0.51', 3, 36],
      ['trade', 'Ship +55 shares at 0.49', 9, 27],
      ['promise', 'Locked 300 SOL behind the fee-switch promise', 100, 300],
    ],
  },
  tidewater: {
    summary: 'A deposit pool that routes idle stablecoins to short-term markets.',
    past: [
      ['Reach 500 unique depositors.', 'shipped', 45, 300],
      ['Add a second yield source.', 'shipped', 101, 220],
      ['Cut withdrawal time under 10 minutes.', 'shipped', 160, 150],
      ['Open the pool without an allowlist.', 'slashed', 230, 400],
    ],
    events: [
      ['trade', 'Ship +300 shares at 0.58', 0.2, 174],
      ['trade', 'Slash +150 shares at 0.42', 1.5, 63],
      ['trade', 'Ship +80 shares at 0.57', 7, 46],
      ['promise', 'Locked 640 SOL behind the 1,000 depositors promise', 190, 640],
    ],
  },
  'lumen-relay': {
    summary: 'A payments SDK for programs that settle in stablecoins.',
    past: [['Ship the SDK beta to ten partners.', 'shipped', 58, 60]],
    events: [
      ['trade', 'Slash +45 shares at 0.67', 2.5, 30],
      ['promise', 'Locked 90 SOL behind the payments SDK promise', 160, 90],
      ['settlement', 'SDK beta promise shipped; collateral released', 58 * 24, 60],
    ],
  },
  northline: {
    summary: 'Overcollateralised lending with conservative listings.',
    past: [
      ['Complete the second security audit.', 'shipped', 36, 500],
      ['Reach 20M in deposits.', 'slashed', 110, 650],
    ],
    events: [
      ['trade', 'Slash +400 shares at 0.78', 0.8, 312],
      ['trade', 'Ship +120 shares at 0.22', 4, 26],
      ['promise', 'Locked 820 SOL behind the new collateral promise', 130, 820],
    ],
  },
  arclight: {
    summary: 'Ticketing for live events using compressed tokens.',
    past: [
      ['Sell out the pilot event through the app.', 'shipped', 29, 70],
      ['Add wallet-free checkout.', 'shipped', 80, 50],
    ],
    events: [
      ['trade', 'Ship +90 shares at 0.66', 3.5, 59],
      ['promise', 'Locked 130 SOL behind the compressed ticketing promise', 24, 130],
    ],
  },
  glasswing: {
    summary: 'Liquid staking with explicit, enforced penalties.',
    past: [
      ['Publish the validator selection rules.', 'shipped', 47, 110],
      ['Reach 50k staked SOL.', 'slashed', 125, 190],
    ],
    events: [
      ['settlement', 'Deadline passed; the onchain check is running', 2],
      ['trade', 'Ship +60 shares at 0.52', 5, 31],
      ['promise', 'Locked 260 SOL behind the staking promise', 140, 260],
    ],
  },
  mossgrove: {
    summary: 'A cross-chain bridge with transparent limits.',
    past: [
      ['Open the bridge beta to allowlisted users.', 'shipped', 84, 120],
      ['Add the second chain.', 'shipped', 140, 100],
    ],
    events: [
      ['settlement', 'Bridge promise shipped; 180 SOL collateral released', 72, 180],
      ['trade', 'Ship +210 shares at 0.93', 76, 195],
      ['promise', 'Locked 180 SOL behind the bridge promise', 210, 180],
    ],
  },
  'pale-ember': {
    summary: 'Perpetuals trading, early and ambitious.',
    past: [['Publish the risk engine specification.', 'shipped', 190, 90]],
    events: [
      ['settlement', 'Perps promise slashed; 340 SOL collateral paid out', 144, 340],
      ['trade', 'Slash +260 shares at 0.80', 150, 208],
      ['promise', 'Locked 340 SOL behind the perps promise', 330, 340],
    ],
  },
};

export function createFixtureProjects(now: number): Project[] {
  return createFixtureMarkets(now).map((current) => {
    const slug = projectSlug(current);
    const extra = EXTRAS[slug] ?? { summary: '', past: [], events: [] };
    const history: PastPromise[] = extra.past
      .map(([statement, outcome, daysAgo, collateralSol], i) => ({
        id: `${slug}-p${i}`,
        statement,
        outcome,
        settledAt: new Date(now - daysAgo * DAY).toISOString(),
        collateralSol,
      }))
      .sort((a, b) => Date.parse(b.settledAt) - Date.parse(a.settledAt));
    const activity: ActivityEvent[] = extra.events
      .map(([kind, text, hoursAgo, amountSol], i) => ({
        id: `${slug}-e${i}`,
        kind,
        text,
        at: new Date(now - hoursAgo * HOUR).toISOString(),
        ...(amountSol === undefined ? {} : { amountSol }),
      }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return {
      slug,
      name: current.team,
      ticker: current.ticker,
      summary: extra.summary,
      current,
      history,
      activity,
    };
  });
}
