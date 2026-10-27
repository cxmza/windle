import type { TweetMedia } from '@windle/shared';

export interface FeedAccount {
  handle: string;
  name: string;
  verified?: boolean;
  /** Set when the account speaks for a project the app lists. */
  ticker?: string;
}

export const ACCOUNTS: readonly FeedAccount[] = [
  { handle: 'kestrel_hq', name: 'Kestrel Protocol', verified: true, ticker: 'KSTL' },
  { handle: 'basaltgames_dev', name: 'Basalt Games', verified: true, ticker: 'BSLT' },
  { handle: 'sproutfi_dev', name: 'Sprout Finance', verified: true, ticker: 'SPRT' },
  { handle: 'moonpaw_team', name: 'MoonPaw', ticker: 'PAW' },
  { handle: 'bonkers_cto', name: 'Bonkers CTO', ticker: 'BNKR' },
  { handle: 'tidewater_fi', name: 'Tidewater', verified: true, ticker: 'TIDE' },
  { handle: 'glowbyte_sol', name: 'Glowbyte', ticker: 'GLOW' },
  { handle: 'fernwave_cto', name: 'Fernwave', ticker: 'FERN' },
  { handle: 'saltlick_labs', name: 'Saltlick Labs', ticker: 'SALT' },
  { handle: 'degenfeed_demo', name: 'Degen Feed' },
  { handle: 'anon_ape_demo', name: 'anon ape' },
  { handle: 'chartnerd_demo', name: 'Chart Nerd' },
  { handle: 'alphaleak_demo', name: 'Alpha Leaks' },
  { handle: 'onchain_owl', name: 'Onchain Owl' },
  { handle: 'soljunkie_demo', name: 'sol junkie' },
];

export type PoolMedia = 'chart' | 'roadmap' | 'screenshot';

export interface PoolEntry {
  handle: string;
  text: string;
  media?: PoolMedia;
}

export const POOL: readonly PoolEntry[] = [
  {
    handle: 'glowbyte_sol',
    text: 'v1 of the Glowbyte launchpad ships next Wednesday. reply with your wallet if you want early access.',
  },
  {
    handle: 'fernwave_cto',
    text: 'community vote on the treasury plan closes Thursday. we execute the same day. transparent as always.',
  },
  {
    handle: 'saltlick_labs',
    text: 'we are open sourcing the matching engine this month. repo goes public with a full test suite.',
  },
  {
    handle: 'kestrel_hq',
    text: 'withdrawal queue is live on devnet. 1,200 test withdrawals processed, p99 under 2 slots.',
    media: 'chart',
  },
  {
    handle: 'kestrel_hq',
    text: 'mainnet upgrade of the vault program is scheduled for Friday 14:00 UTC. audit report linked in the thread.',
  },
  {
    handle: 'basaltgames_dev',
    text: 'season two item set drops by end of month. 40 new pieces, all craftable onchain.',
    media: 'roadmap',
  },
  { handle: 'basaltgames_dev', text: 'crafting update: recipe engine is merged, balance pass in progress. 70% done.' },
  { handle: 'sproutfi_dev', text: 'we will publish the staking v2 audit before we deploy. no shortcuts, promise.' },
  {
    handle: 'sproutfi_dev',
    text: 'staking v2 is on devnet now. testing the new reward curve all day, break it if you can.',
    media: 'screenshot',
  },
  {
    handle: 'moonpaw_team',
    text: 'paw merch drop in 2 weeks. holders first, then everyone. design preview coming tomorrow.',
  },
  { handle: 'moonpaw_team', text: 'thank you for 10k holders. we are just getting started. gm paws.' },
  { handle: 'bonkers_cto', text: 'bonkers game jam results are in. 214 submissions. winners announced Sunday.' },
  {
    handle: 'bonkers_cto',
    text: 'merch update: samples arrived, hoodies look insane. store page is 80% built.',
    media: 'screenshot',
  },
  {
    handle: 'tidewater_fi',
    text: 'tidewater pool passed 800 unique depositors. 1,000 by next Friday is the goal.',
    media: 'chart',
  },
  {
    handle: 'tidewater_fi',
    text: 'we are raising the deposit cap to 2M this week. rate model update follows on Monday.',
  },
  {
    handle: 'glowbyte_sol',
    text: 'launchpad beta tested with 30 teams. fixed 12 bugs, 3 left. shipping to everyone by Wednesday.',
  },
  {
    handle: 'glowbyte_sol',
    text: 'new brand kit is out. grab the logos, we love seeing them in your banners.',
    media: 'roadmap',
  },
  {
    handle: 'fernwave_cto',
    text: 'treasury report for the quarter is live. runway is 26 months at current burn.',
    media: 'chart',
  },
  { handle: 'fernwave_cto', text: 'governance forum is open for the next proposal. draft is due Tuesday.' },
  {
    handle: 'saltlick_labs',
    text: 'matching engine benchmarks: 180k orders per second on a single core. details in the repo soon.',
    media: 'chart',
  },
  { handle: 'saltlick_labs', text: 'we will release the SDK within 10 days. typescript first, rust right after.' },
  { handle: 'degenfeed_demo', text: 'solana mempool looking spicy today. who is still up?' },
  { handle: 'degenfeed_demo', text: 'new pairs are printing faster than my coffee machine. gm.' },
  {
    handle: 'degenfeed_demo',
    text: 'rotation into infra tokens continues. kestrel and tidewater leading the bid.',
    media: 'chart',
  },
  { handle: 'anon_ape_demo', text: '@kestrel_hq when mainnet v2 by friday??' },
  { handle: 'anon_ape_demo', text: 'bought the dip, sold the dip, bought the dip again. financial advice: none.' },
  { handle: 'anon_ape_demo', text: '@moonpaw_team cex listing wen' },
  {
    handle: 'chartnerd_demo',
    text: 'TIDE holding the 4h trendline. a clean break above opens the way up.',
    media: 'chart',
  },
  { handle: 'chartnerd_demo', text: 'volume is drying up on the majors. patience pays.' },
  {
    handle: 'chartnerd_demo',
    text: 'KSTL daily structure: higher lows since the last unlock. watching closely.',
    media: 'chart',
  },
  {
    handle: 'alphaleak_demo',
    text: 'hearing a certain mid-cap team has a big announcement lined up next week. no names.',
  },
  { handle: 'alphaleak_demo', text: 'devs are quietly shipping. check commit logs before you check the timeline.' },
  {
    handle: 'alphaleak_demo',
    text: 'a new launchpad is about to open to the public within days. early users get fee rebates.',
  },
  {
    handle: 'onchain_owl',
    text: 'whale moved 400k SPRT to a fresh wallet. could be staking prep.',
    media: 'screenshot',
  },
  { handle: 'onchain_owl', text: 'daily active wallets on solana at a 3 month high. numbers do not lie.' },
  {
    handle: 'onchain_owl',
    text: 'BSLT crafting txs doubled since the last patch. players are here.',
    media: 'chart',
  },
  {
    handle: 'soljunkie_demo',
    text: 'cannot believe the fees are this low. back in my day it was a whole sol per swap. lol no it was not.',
  },
  { handle: 'soljunkie_demo', text: 'gm to everyone building through the noise.' },
  { handle: 'soljunkie_demo', text: 'my bags: heavy. my conviction: heavier. my wifi: broken.' },
  { handle: 'kestrel_hq', text: 'we hired two more protocol engineers. say hi if you are at the meetup in Lisbon.' },
  {
    handle: 'basaltgames_dev',
    text: 'patch notes: fixed the duplicate item bug, improved wallet connect, new loading screen.',
  },
  { handle: 'tidewater_fi', text: 'weekly digest: TVL up 12%, depositors up 9%, zero incidents.', media: 'chart' },
  { handle: 'glowbyte_sol', text: 'mainnet launch is confirmed for next Monday. we will stream the deploy live.' },
];

export function mediaFor(kind: PoolMedia | undefined, origin: string): TweetMedia[] | undefined {
  return kind ? [{ kind: 'image', url: `${origin}/feed/${kind}.svg`, alt: `${kind} attached to the post` }] : undefined;
}
