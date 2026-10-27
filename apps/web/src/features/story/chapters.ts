/** Every chapter's scene key, in page order (the `ecosystem` chapter sits before the final CTA). */
export const SCENE_KEYS = [
  'hero',
  'promise',
  'collateral',
  'market',
  'incentive',
  'judge',
  'outcome',
  'ecosystem',
  'cta',
] as const;

export type ChapterKey = (typeof SCENE_KEYS)[number];

/** Keys scene/poses.ts has a 3D pose for: every chapter has one. */
export type SceneKey = ChapterKey;

export interface Chapter {
  /** Stable DOM id and data-chapter value (ScrollTrigger hook). */
  id: ChapterKey;
  /** 0 = hero, 1..7 = narrative chapters (7 = ecosystem), 8 = final CTA. */
  index: number;
  /** Short label for the chapter indicator. */
  name: string;
  kicker: string;
  title: string;
  caption: string;
  /** One-line description for navigation menus (narrative chapters only). */
  summary?: string;
  /** Word inside title or caption rendered with inverted emphasis. */
  emphasis: string | null;
  /** Key the 3D layer reads to pick the scene. */
  scene: ChapterKey;
  /** Section min-height in vh: room for scroll-driven motion. */
  heightVh: number;
}

export const CHAPTERS = [
  {
    id: 'hero',
    index: 0,
    name: 'Intro',
    kicker: 'windle · Solana protocol',
    title: 'SHIP OR SLASH.',
    caption: 'windle puts promises on the line: collateral behind them, markets pricing them, the chain as the judge.',
    emphasis: null,
    scene: 'hero',
    heightVh: 200,
  },
  {
    id: 'promise',
    summary: 'A team makes a verifiable onchain claim.',
    index: 1,
    name: 'Promise',
    kicker: 'Chapter 01',
    title: 'A TEAM MAKES A PROMISE.',
    caption: "'Mainnet by Dec 1.' Not a tweet — an onchain claim anyone can verify.",
    emphasis: 'PROMISE',
    scene: 'promise',
    heightVh: 150,
  },
  {
    id: 'collateral',
    summary: 'Funds locked behind every promise.',
    index: 2,
    name: 'Collateral',
    kicker: 'Chapter 02',
    title: 'THEY LOCK COLLATERAL BEHIND IT.',
    caption: "50,000 USDC they lose if they don't deliver.",
    emphasis: 'COLLATERAL',
    scene: 'collateral',
    heightVh: 150,
  },
  {
    id: 'market',
    summary: 'Buy YES or NO. The price is the odds.',
    index: 3,
    name: 'Market',
    kicker: 'Chapter 03',
    title: 'THE MARKET PRICES THE TRUTH.',
    caption: "Buy YES if you believe. Buy NO if you don't. The price is the odds.",
    emphasis: 'TRUTH',
    scene: 'market',
    heightVh: 150,
  },
  {
    id: 'incentive',
    summary: 'The team profits only by shipping.',
    index: 4,
    name: 'Incentive',
    kicker: 'Chapter 04',
    title: 'THE ONLY INSIDER IS THE TEAM.',
    caption: 'And the only way they profit is by shipping.',
    emphasis: 'SHIPPING',
    scene: 'incentive',
    heightVh: 150,
  },
  {
    id: 'judge',
    summary: 'At the deadline, the chain decides.',
    index: 5,
    name: 'Judge',
    kicker: 'Chapter 05',
    title: 'AT THE DEADLINE, THE CHAIN DECIDES.',
    caption: 'Program deployed? Vesting untouched? Revenue above N? No oracle votes. No disputes.',
    emphasis: 'CHAIN',
    scene: 'judge',
    heightVh: 200,
  },
  {
    id: 'outcome',
    summary: 'Ship: collateral back. Slash: to NO holders.',
    index: 6,
    name: 'Outcome',
    kicker: 'Chapter 06',
    title: 'TWO ENDINGS.',
    caption: 'Every promise resolves one of two ways.',
    emphasis: null,
    scene: 'outcome',
    heightVh: 200,
  },
  {
    id: 'ecosystem',
    summary: 'Built on Solana, works with pump.fun tokens.',
    index: 7,
    name: 'Ecosystem',
    kicker: 'Ecosystem',
    title: 'BUILT ON SOLANA.',
    caption: 'Works with pump.fun tokens. Follow on X.',
    emphasis: 'SOLANA',
    scene: 'ecosystem',
    heightVh: 150,
  },
  {
    id: 'cta',
    index: 8,
    name: 'Join',
    kicker: 'The end',
    title: "TALK IS CHEAP. COLLATERAL ISN'T.",
    caption: 'Put something behind your word.',
    emphasis: 'COLLATERAL',
    scene: 'cta',
    heightVh: 130,
  },
] as const satisfies readonly Chapter[];

/** Narrative chapters counted by the indicator: "01 / 08" (hero is 00, final CTA is 08). */
export const NARRATIVE_COUNT = CHAPTERS.length - 1;

export const OUTCOMES = {
  ship: { label: 'SHIP', arrow: '→', result: 'collateral returned, YES paid.' },
  slash: { label: 'SLASH', arrow: '→', result: 'collateral slashed to NO holders.' },
} as const;

export const CTAS = [
  { label: 'Make a promise', href: '/launch', variant: 'primary' },
  { label: 'Back a team', href: '/launch', variant: 'ghost' },
] as const;

/** Slots the 3D layer places extruded logos over: `[data-logo-slot="<id>"]` (see hand/logo-sketch.ts). */
export const LOGO_SLOT_IDS = ['solana', 'pumpfun', 'x'] as const;
export type LogoSlotId = (typeof LOGO_SLOT_IDS)[number];

/**
 * Ecosystem links. Wording is factual and deliberately not a partnership claim ("Built on", "Works with",
 * "Follow on"); the section also carries an "unaffiliated" line.
 */
export const ECOSYSTEM = [
  { slot: 'solana', prefix: 'Built on', label: 'Solana', href: 'https://solana.com' },
  { slot: 'pumpfun', prefix: 'Works with', label: 'pump.fun tokens', href: 'https://pump.fun' },
  // null: the link comes from the shared config in @windle/brand (resolved where it renders, Ecosystem.tsx)
  { slot: 'x', prefix: 'Follow on', label: 'X', href: null },
] as const satisfies readonly {
  slot: LogoSlotId;
  prefix: string;
  label: string;
  href: string | null;
}[];

export const EXAMPLE_MARKET = { yes: 72, no: 28, question: 'Mainnet by Dec 1' } as const;

export function formatChapterIndex(index: number): string {
  return `${String(index).padStart(2, '0')} / ${String(NARRATIVE_COUNT).padStart(2, '0')}`;
}
