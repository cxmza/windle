import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type MarketStatus, type MarketTier, SIDE_LABELS } from '@windle/shared';
import { loadSharp } from '../media/process.ts';

/**
 * Share card (Open Graph / X summary_large_image) rendered as 1200x630 PNG: satori lays out a plain element tree
 * into SVG, resvg rasterises it. Both load lazily on the first render, so boot and tests that never draw a card
 * do not pay for them. Fonts: Inter (SIL OFL 1.1, see assets/fonts/OFL.txt), latin + latin-ext + cyrillic subsets.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** Bump when the card layout changes so cached PNGs and crawler caches roll over. */
export const OG_TEMPLATE_VERSION = 1;

/** Same shape as packages/brand/assets/windle-mark.svg (a test keeps them identical). */
export const WINDLE_MARK_PATH =
  'M30 14H32.5L44 58L55.5 14H64.5L76 58L87.5 14H90A16 16 0 0 1 106 30V90A16 16 0 0 1 90 106H73.3L60 70L46.7 106H30A16 16 0 0 1 14 90V30A16 16 0 0 1 30 14Z';

/** sRGB values of tokens (packages/tokens/src/palette.ts: BLUE[50], BLUE[500], BLUE[700]). */
const COLOR = {
  bg: '#000314',
  panel: '#0b1228',
  line: '#1b2547',
  text: '#f4f6fb',
  muted: '#9aa6c4',
  accent: '#1c69e3',
  yes: '#43acfb',
  no: '#f2f4f8',
};

export interface OgCard {
  statement: string;
  probYes: number;
  status: MarketStatus;
  tier: MarketTier;
  outcome: 'yes' | 'no' | 'void' | null;
  ticker: string;
  author: { handle: string; name: string } | null;
  /** data: URI of the author's avatar, already fetched. */
  avatar: string | null;
  /** data: URI of the market image (from its master on disk), drawn beside the question. */
  image: string | null;
}

interface Node {
  type: string;
  key: null;
  props: Record<string, unknown> & { style?: Record<string, string | number>; children?: unknown };
}

const h = (
  type: string,
  style: Record<string, string | number>,
  children?: unknown,
  extra: Record<string, unknown> = {},
): Node => ({
  type,
  key: null,
  props: { style, ...extra, ...(children === undefined ? {} : { children }) },
});

const pct = (p: number) => `${Math.round(p * 100)}%`;

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function statusLine(card: OgCard): string {
  const labels = SIDE_LABELS[card.tier];
  if (card.status === 'resolved' && card.outcome && card.outcome !== 'void')
    return `Resolved: ${card.outcome.toUpperCase()} · ${labels[card.outcome]}`;
  if (card.status === 'voided') return 'Voided · stakes refunded';
  if (card.status === 'closed') return 'Trading closed · awaiting resolution';
  return 'Live market';
}

function sideBlock(label: string, sub: string, value: string, color: string, filled: boolean): Node {
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      flexBasis: 0,
      padding: '22px 28px',
      borderRadius: 24,
      border: `2px solid ${filled ? color : COLOR.line}`,
      backgroundColor: filled ? COLOR.panel : 'transparent',
    },
    [
      h(
        'div',
        { display: 'flex', fontSize: 26, color: COLOR.muted, fontWeight: 700, letterSpacing: 2 },
        `${label} · ${sub}`,
      ),
      h('div', { display: 'flex', fontSize: 84, fontWeight: 700, color, lineHeight: 1.05 }, value),
    ],
  );
}

export function cardTree(card: OgCard): Node {
  const labels = SIDE_LABELS[card.tier];
  const statement = truncate(card.statement, card.image ? 120 : 150);
  const size = statement.length > 110 ? 48 : statement.length > 70 ? 56 : card.image ? 58 : 64;
  const winner = card.status === 'resolved' ? card.outcome : null;

  const brand = h('div', { display: 'flex', alignItems: 'center', gap: 16 }, [
    h('svg', { width: 56, height: 56 }, [h('path', {}, undefined, { d: WINDLE_MARK_PATH, fill: COLOR.accent })], {
      width: 56,
      height: 56,
      viewBox: '0 0 120 120',
    }),
    h('div', { display: 'flex', fontSize: 40, fontWeight: 700, color: COLOR.text, letterSpacing: -1 }, 'windle'),
  ]);

  const note = h(
    'div',
    {
      display: 'flex',
      fontSize: 22,
      color: COLOR.muted,
      padding: '10px 18px',
      borderRadius: 999,
      border: `2px solid ${COLOR.line}`,
    },
    'Practice points · no real money',
  );

  const authorRow = card.author
    ? h('div', { display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: COLOR.muted }, [
        card.avatar
          ? h('img', { width: 44, height: 44, borderRadius: 999 }, undefined, {
              src: card.avatar,
              width: 44,
              height: 44,
            })
          : h(
              'div',
              {
                display: 'flex',
                width: 44,
                height: 44,
                borderRadius: 999,
                backgroundColor: COLOR.panel,
                alignItems: 'center',
                justifyContent: 'center',
                color: COLOR.text,
                fontWeight: 700,
                fontSize: 22,
              },
              card.author.handle.slice(0, 1).toUpperCase(),
            ),
        h('div', { display: 'flex' }, `@${card.author.handle} · $${card.ticker}`),
      ])
    : h('div', { display: 'flex', fontSize: 26, color: COLOR.muted }, `$${card.ticker}`);

  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: OG_WIDTH,
      height: OG_HEIGHT,
      paddingTop: 48,
      paddingBottom: 44,
      paddingLeft: 56,
      paddingRight: 56,
      boxSizing: 'border-box',
      backgroundColor: COLOR.bg,
      color: COLOR.text,
      fontFamily: FONT_FAMILY,
      justifyContent: 'space-between',
    },
    [
      h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [brand, note]),
      h('div', { display: 'flex', alignItems: 'center', gap: 32 }, [
        h('div', { display: 'flex', flexDirection: 'column', gap: 20, flexGrow: 1, flexBasis: 0 }, [
          authorRow,
          h(
            'div',
            { display: 'flex', fontSize: size, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 },
            statement,
          ),
        ]),
        ...(card.image
          ? [
              h('img', { width: OG_IMAGE_SIZE, height: OG_IMAGE_SIZE, borderRadius: 28, flexShrink: 0 }, undefined, {
                src: card.image,
                width: OG_IMAGE_SIZE,
                height: OG_IMAGE_SIZE,
              }),
            ]
          : []),
      ]),
      h('div', { display: 'flex', flexDirection: 'column', gap: 14 }, [
        h('div', { display: 'flex', gap: 24 }, [
          sideBlock('YES', labels.yes, pct(card.probYes), COLOR.yes, winner === 'yes' || winner === null),
          sideBlock('NO', labels.no, pct(1 - card.probYes), COLOR.no, winner === 'no' || winner === null),
        ]),
        h('div', { display: 'flex', justifyContent: 'space-between', fontSize: 22, color: COLOR.muted }, [
          h('div', { display: 'flex' }, statusLine(card)),
          h('div', { display: 'flex' }, 'app.windle.fun'),
        ]),
      ]),
    ],
  );
}

interface FontSpec {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
}

/** One family per subset: satori matches a glyph through the font-family list, not across same-named fonts. */
const FONT_FILES: Array<{ file: string; name: string; weight: 400 | 700 }> = [
  { file: 'inter-latin-400.ttf', name: 'Inter', weight: 400 },
  { file: 'inter-latin-700.ttf', name: 'Inter', weight: 700 },
  { file: 'inter-latin-ext-400.ttf', name: 'Inter Ext', weight: 400 },
  { file: 'inter-latin-ext-700.ttf', name: 'Inter Ext', weight: 700 },
  { file: 'inter-cyrillic-400.ttf', name: 'Inter Cyrillic', weight: 400 },
  { file: 'inter-cyrillic-700.ttf', name: 'Inter Cyrillic', weight: 700 },
];
const FONT_FAMILY = FONT_FILES.filter((f, i, all) => all.findIndex((o) => o.name === f.name) === i)
  .map((f) => `'${f.name}'`)
  .join(', ');

/** assets/fonts next to src (dev, tests: src/share -> ../../assets) or next to dist (bundle: dist -> ../assets). */
export function fontsDir(): string {
  const candidates = [new URL('../../assets/fonts/', import.meta.url), new URL('../assets/fonts/', import.meta.url)];
  for (const url of candidates) {
    const dir = fileURLToPath(url);
    if (existsSync(dir)) return dir;
  }
  throw new Error('og: assets/fonts not found');
}

interface Renderer {
  fonts: FontSpec[];
  satori: typeof import('satori').default;
  Resvg: typeof import('@resvg/resvg-js').Resvg;
}

let renderer: Promise<Renderer> | undefined;

function loadRenderer(): Promise<Renderer> {
  renderer ??= (async () => {
    const dir = fontsDir();
    const [satoriModule, resvgModule, ...fonts] = await Promise.all([
      import('satori'),
      import('@resvg/resvg-js'),
      ...FONT_FILES.map(async (f) => ({
        name: f.name,
        data: await readFile(dir + f.file),
        weight: f.weight,
        style: 'normal' as const,
      })),
    ]);
    return { fonts, satori: satoriModule.default, Resvg: resvgModule.Resvg };
  })().catch((err: unknown) => {
    renderer = undefined;
    throw err;
  });
  return renderer;
}

export async function renderOgPng(card: OgCard): Promise<Buffer> {
  const { fonts, satori, Resvg } = await loadRenderer();
  const svg = await satori(cardTree(card) as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
  });
  // System fonts are never needed (satori outlines all text) and scanning them costs seconds.
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
  return Buffer.from(png);
}

const OG_IMAGE_SIZE = 184;

/**
 * The market image for the card as a JPEG data: URI, square-cropped at 2x the drawn size from the master bytes
 * (read from disk by the caller, never over HTTP). Transparency is flattened onto the card panel colour.
 */
export async function marketImageDataUri(master: Buffer | null): Promise<string | null> {
  if (!master) return null;
  try {
    const sharp = await loadSharp();
    const jpeg = await sharp(master)
      .resize({ width: OG_IMAGE_SIZE * 2, height: OG_IMAGE_SIZE * 2, fit: 'cover', position: 'attention' })
      .flatten({ background: COLOR.panel })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}

const AVATAR_HOSTS = new Set(['pbs.twimg.com', 'abs.twimg.com']);
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png']);
const AVATAR_MAX_BYTES = 512 * 1024;

/**
 * Fetches an X avatar as a data: URI for the card. Only X's image hosts, jpeg/png, small, with a short timeout;
 * anything else returns null and the card draws an initial instead.
 */
export async function fetchAvatar(url: string | undefined, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!url || !URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !AVATAR_HOSTS.has(parsed.hostname)) return null;
  parsed.pathname = parsed.pathname.replace(/_normal\.(jpe?g|png)$/i, '_200x200.$1');
  try {
    const res = await fetchImpl(parsed, { signal: AbortSignal.timeout(2500), redirect: 'error' });
    const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!res.ok || !AVATAR_TYPES.has(type)) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > AVATAR_MAX_BYTES) return null;
    return `data:${type};base64,${body.toString('base64')}`;
  } catch {
    return null;
  }
}
