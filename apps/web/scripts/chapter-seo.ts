/**
 * Per-chapter SEO copy for www.windle.fun: one static HTML file per clean chapter path (see seo-pages.ts).
 * Visible chapter text (kicker / title / caption / summary) comes from the story itself (src/features/story/chapters.ts),
 * so the pre-rendered markup never says something the page does not. Only <title> and meta descriptions live here.
 *
 * Paths mirror CHAPTER_PATHS in src/features/story/routes.ts and the location list in
 * infra/nginx/sites/windle-20-www.conf - keep all three in sync.
 */
import { CHAPTERS, type ChapterKey, OUTCOMES } from '../src/features/story/chapters.ts';

export const SITE_URL = 'https://www.windle.fun';
export const SITE_NAME = 'windle';
export const THEME_COLOR = '#000314';

export const SITE_DESCRIPTION =
  'windle is a Solana protocol: teams back onchain-verifiable promises with collateral, a YES/NO market prices them, ' +
  'and at the deadline the chain decides. Ship: collateral returned, YES paid. Miss: collateral slashed to NO holders.';

export const PRELAUNCH_NOTE = 'windle is pre-launch. Markets, prices and amounts shown on this site are illustrative.';

interface ChapterSeo {
  path: string;
  /** Static output file inside dist/ (nginx serves it for `path`). */
  file: string;
  /** <title> and og:title. */
  title: string;
  /** meta description and og:description, ~150 characters. */
  description: string;
}

export const CHAPTER_SEO = {
  hero: {
    path: '/',
    file: 'index.html',
    title: 'windle — ship or slash: onchain promises with collateral',
    description:
      'windle is a Solana protocol: teams back onchain-verifiable promises with collateral, a YES/NO market prices them, and the chain decides at the deadline.',
  },
  promise: {
    path: '/promise',
    file: 'promise.html',
    title: 'Promise — windle: a team makes an onchain promise',
    description:
      "A windle promise is an onchain claim anyone can verify: 'Mainnet by Dec 1', not a tweet. The team commits to a deadline the chain itself can check.",
  },
  collateral: {
    path: '/collateral',
    file: 'collateral.html',
    title: 'Collateral — windle: money locked behind every promise',
    description:
      "Teams lock collateral behind every windle promise, funds they lose if they don't deliver. Skin in the game, enforced by a Solana program, not by trust.",
  },
  market: {
    path: '/market',
    file: 'market.html',
    title: 'Market — windle: the market prices the truth',
    description:
      "Every windle promise gets a YES/NO market. Buy YES if you believe the team ships, NO if you don't. The price is the market's odds of delivery.",
  },
  incentive: {
    path: '/incentive',
    file: 'incentive.html',
    title: 'Incentive — windle: the only insider is the team',
    description:
      'On windle the only insider is the team, and the only way they profit is by shipping: missing the deadline slashes their collateral to NO holders.',
  },
  judge: {
    path: '/judge',
    file: 'judge.html',
    title: 'Judge — windle: at the deadline, the chain decides',
    description:
      'windle promises resolve onchain at the deadline: program deployed, vesting untouched, revenue above a threshold. No oracle votes, no disputes.',
  },
  outcome: {
    path: '/outcome',
    file: 'outcome.html',
    title: 'Outcome — windle: ship or slash, two endings',
    description:
      'Every windle promise resolves one of two ways. Ship: the collateral is returned and YES is paid. Miss: the collateral is slashed to NO holders.',
  },
  ecosystem: {
    path: '/ecosystem',
    file: 'ecosystem.html',
    title: 'Ecosystem — windle: built on Solana',
    description:
      'windle is a protocol built on Solana that works with pump.fun tokens. Promises, collateral and market resolution all live onchain.',
  },
  cta: {
    path: '/launch',
    file: 'launch.html',
    title: "Join — windle: talk is cheap, collateral isn't",
    description:
      'Put something behind your word: make a promise backed by collateral, or back a team that ships. windle is a pre-launch Solana protocol.',
  },
} as const satisfies Record<ChapterKey, ChapterSeo>;

export interface SeoPage extends ChapterSeo {
  id: ChapterKey;
  url: string;
  ogImage: string;
  kicker: string;
  heading: string;
  caption: string;
  summary: string | null;
  name: string;
}

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** og image file name (in public/og/) for a chapter. */
export function ogFile(id: ChapterKey): string {
  return id === 'hero' ? 'og.png' : `og/${CHAPTER_SEO[id].path.slice(1)}.png`;
}

export const SEO_PAGES: readonly SeoPage[] = CHAPTERS.map((chapter) => {
  const seo = CHAPTER_SEO[chapter.id];
  return {
    ...seo,
    id: chapter.id,
    url: seo.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${seo.path}`,
    ogImage: `${SITE_URL}/${ogFile(chapter.id)}`,
    kicker: chapter.kicker,
    heading: chapter.title,
    caption: chapter.caption,
    summary: 'summary' in chapter ? chapter.summary : null,
    name: chapter.name,
  };
});

export const OUTCOME_LINES = Object.values(OUTCOMES).map((o) => `${o.label} ${o.arrow} ${o.result}`);
