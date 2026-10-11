import { CHAPTERS, ECOSYSTEM } from '../story/chapters';
import { chapterPath } from '../story/routes';

export interface FooterLink {
  label: string;
  href: string;
  /** External links open in a new tab; chapter paths are handled by the story router. */
  external: boolean;
}

export interface FooterColumn {
  title: string;
  links: readonly FooterLink[];
}

const external = (label: string, href: string): FooterLink => ({ label, href, external: true });

const PROTOCOL_LABELS: Partial<Record<(typeof CHAPTERS)[number]['id'], string>> = {
  promise: 'How it works',
  collateral: 'Collateral',
  market: 'Market',
  incentive: 'Incentive',
  judge: 'Judge',
  outcome: 'Outcome',
  ecosystem: 'Ecosystem',
};

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    title: 'Product',
    links: [
      external('App', 'https://app.windle.fun'),
      external('Sign in', 'https://oauth.windle.fun'),
      external('Docs', 'https://docs.windle.fun'),
      external('API reference', 'https://api.windle.fun/reference/'),
    ],
  },
  {
    title: 'Protocol',
    links: CHAPTERS.flatMap((chapter) => {
      const label = PROTOCOL_LABELS[chapter.id];
      return label ? [{ label, href: chapterPath(chapter.id), external: false }] : [];
    }),
  },
  {
    title: 'Resources',
    links: [
      external('Brand kit', 'https://cdn.windle.fun/'),
      external('Changelog', 'https://docs.windle.fun/changelog/'),
      external('FAQ', 'https://docs.windle.fun/faq/'),
    ],
  },
  {
    title: 'Legal',
    links: [
      external('Terms', 'https://docs.windle.fun/legal/terms/'),
      external('Privacy', 'https://docs.windle.fun/legal/privacy/'),
      external('Risk', 'https://docs.windle.fun/legal/risk/'),
    ],
  },
];

export interface Social {
  slot: 'x' | 'github';
  label: string;
  /** null until the account / repository exists: such an entry is not rendered. */
  href: string | null;
  placeholder: boolean;
}

const x = ECOSYSTEM.find((item) => item.slot === 'x');

/** Icon-only social buttons. X reuses the ecosystem chapter's (placeholder) entry; GitHub appears once it has a URL. */
export const SOCIALS: readonly Social[] = [
  ...(x ? [{ slot: 'x', label: x.label, href: x.href, placeholder: x.placeholder } satisfies Social] : []),
  // TODO: set the repository URL once it is public; until then the button stays hidden.
  { slot: 'github', label: 'GitHub', href: null, placeholder: false },
];

/** The legal links repeated inline in the bottom bar. */
export const LEGAL_LINKS: readonly FooterLink[] = FOOTER_COLUMNS.find((c) => c.title === 'Legal')?.links ?? [];

export const DISCLAIMER = 'Built on Solana · Not affiliated with Solana, pump.fun or X · Illustrative example data';
export const TAGLINE = 'Promises with collateral. Markets that price them. The chain as the judge.';

export const HEALTH_URL = 'https://api.windle.fun/health';
