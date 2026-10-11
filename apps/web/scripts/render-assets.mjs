// Renders the raster brand assets of the windle sites with headless Chromium (Playwright, already a dev dependency):
//   favicon.ico (16/32/48), apple-touch-icon.png (180, solid), icon-192/512.png, icon-maskable-512.png
//     -> apps/web/public, apps/app/public, apps/docs/public (infra/cdn: favicon.ico + apple-touch-icon.png only)
//   Open Graph images 1200x630 -> apps/web/public/og.png + og/<chapter>.png, apps/app/public/og.png, infra/cdn/og.png
// Shape and colour come from packages/brand + packages/tokens; chapter copy from apps/web/scripts/chapter-seo.ts.
// The outputs are committed; re-run only when the brand or the copy changes. From the repo root:
//   node --experimental-strip-types apps/web/scripts/render-assets.mjs
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CHAPTERS } from '../src/features/story/chapters.ts';
import { CHAPTER_SEO, ogFile, THEME_COLOR } from './chapter-seo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const require = createRequire(import.meta.url);

const markPath = readFileSync(join(repo, 'packages/brand/assets/windle-mark.svg'), 'utf8').match(/ d="([^"]+)"/)?.[1];
if (!markPath) throw new Error('mark path not found');
const palette = readFileSync(join(repo, 'packages/tokens/src/palette.ts'), 'utf8');
const BLUE = palette.match(/\b500:\s*'(#[0-9a-f]{6})'/i)?.[1];
if (!BLUE) throw new Error('BLUE[500] not found');

function fontDataUrl(pkg) {
  const dir = join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  const file = readdirSync(dir).find((f) => /-latin-wght-normal\.woff2$/.test(f));
  if (!file) throw new Error(`no latin wght woff2 in ${dir}`);
  return `data:font/woff2;base64,${readFileSync(join(dir, file)).toString('base64')}`;
}

/**
 * Square icon SVG. `bg`: 'none' | 'rounded' | 'full'. `scale`: size of the 120-unit mark box relative to the icon.
 * Background = brand void navy with a soft blue bloom, so the mark reads on light and dark launchers alike.
 */
function iconSvg(size, { bg, scale }) {
  const offset = (120 - 120 * scale) / 2;
  const back =
    bg === 'none'
      ? ''
      : `<defs><radialGradient id="g" cx="0.78" cy="1" r="0.9"><stop offset="0" stop-color="#093da1" stop-opacity="0.55"/><stop offset="1" stop-color="${THEME_COLOR}" stop-opacity="0"/></radialGradient></defs>` +
        `<rect width="120" height="120" rx="${bg === 'rounded' ? 26 : 0}" fill="${THEME_COLOR}"/>` +
        `<rect width="120" height="120" rx="${bg === 'rounded' ? 26 : 0}" fill="url(#g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">${back}<path fill="${BLUE}" transform="translate(${offset} ${offset}) scale(${scale})" d="${markPath}"/></svg>`;
}

const ICONS = {
  'favicon-16': [16, { bg: 'none', scale: 1.12 }],
  'favicon-32': [32, { bg: 'none', scale: 1.12 }],
  'favicon-48': [48, { bg: 'none', scale: 1.12 }],
  'apple-touch-icon.png': [180, { bg: 'full', scale: 0.72 }],
  'icon-192.png': [192, { bg: 'rounded', scale: 0.78 }],
  'icon-512.png': [512, { bg: 'rounded', scale: 0.78 }],
  // maskable: the mark stays inside the 80% safe circle whatever shape the launcher cuts
  'icon-maskable-512.png': [512, { bg: 'full', scale: 0.62 }],
};

/** ICO container with embedded PNGs (supported by every browser since IE Vista-era). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const fonts = `
@font-face { font-family: Unbounded; src: url(${fontDataUrl('@fontsource-variable/unbounded')}) format('woff2'); font-weight: 200 900; }
@font-face { font-family: Inter Tight; src: url(${fontDataUrl('@fontsource-variable/inter-tight')}) format('woff2'); font-weight: 100 900; }`;

function ogHtml({ kicker, heading, emphasis, caption, foot, brandSub }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let h = esc(heading);
  if (emphasis) h = h.replace(emphasis, `<em>${emphasis}</em>`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
html, body { margin: 0; }
body {
  width: 1200px; height: 630px; box-sizing: border-box; padding: 64px 80px; overflow: hidden; position: relative;
  display: flex; flex-direction: column; justify-content: space-between;
  color: #f5f7ff; font-family: 'Inter Tight', sans-serif;
  background:
    radial-gradient(38% 52% at 88% 12%, rgb(67 172 251 / 0.22), transparent 70%),
    radial-gradient(55% 75% at 92% 100%, rgb(9 61 161 / 0.7), transparent 72%),
    radial-gradient(70% 80% at 10% 110%, rgb(0 34 119 / 0.55), transparent 70%),
    radial-gradient(40% 40% at 60% 55%, rgb(28 105 227 / 0.12), transparent 70%),
    ${THEME_COLOR};
}
body::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(1px 1px at 12% 22%, #fff9, transparent), radial-gradient(1px 1px at 33% 71%, #fff6, transparent),
  radial-gradient(1.5px 1.5px at 71% 18%, #fffa, transparent), radial-gradient(1px 1px at 84% 64%, #fff7, transparent),
  radial-gradient(1px 1px at 52% 9%, #fff5, transparent), radial-gradient(1.5px 1.5px at 22% 48%, #fff6, transparent),
  radial-gradient(1px 1px at 93% 38%, #fff8, transparent), radial-gradient(1px 1px at 63% 86%, #fff5, transparent); }
.top { display: flex; align-items: center; gap: 18px; }
.top svg { width: 60px; height: 60px; filter: drop-shadow(0 0 28px rgb(108 211 250 / 0.4)); }
.brand { font-family: Unbounded; font-weight: 600; font-size: 34px; letter-spacing: -0.02em; }
.brand span { color: #43acfb; font-weight: 400; }
.kicker { margin: 0 0 22px; font-size: 22px; letter-spacing: 0.2em; text-transform: uppercase; color: #6cd3fa; }
h1 { margin: 0; font-family: Unbounded; font-weight: 700; line-height: 1.0; letter-spacing: -0.035em; max-width: 1040px; }
h1 em { font-style: normal; background: linear-gradient(100deg, #6cd3fa, #1c69e3); -webkit-background-clip: text; background-clip: text; color: transparent; }
p.cap { margin: 24px 0 0; max-width: 900px; font-size: 30px; line-height: 1.3; color: #c9cede; }
.foot { display: flex; justify-content: space-between; font-size: 21px; letter-spacing: 0.18em; text-transform: uppercase; color: #9aa3b8; }
.foot b { color: #6cd3fa; font-weight: 500; }
</style></head><body>
<div class="top"><svg viewBox="0 0 120 120"><path fill="${BLUE}" d="${markPath}"/></svg><div class="brand">windle${brandSub ? ` <span>${brandSub}</span>` : ''}</div></div>
<div>${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}<h1 id="h">${h}</h1>${caption ? `<p class="cap">${esc(caption)}</p>` : ''}</div>
<div class="foot"><span>Solana protocol · pre-launch</span><b>${esc(foot)}</b></div>
<script>
// largest size (<=120px) at which the heading fits in two lines
const h = document.getElementById('h');
for (let s = 120; s >= 56; s -= 2) { h.style.fontSize = s + 'px'; if (h.getBoundingClientRect().height <= s * 2.05 && h.scrollWidth <= 1040) break; }
</script>
</body></html>`;
}

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`wrote ${relative(repo, path)}`);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  const iconPngs = {};
  for (const [name, [size, opts]] of Object.entries(ICONS)) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${iconSvg(size, opts)}</body></html>`,
    );
    iconPngs[name] = await page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  }
  const favicon = ico([16, 32, 48].map((size) => ({ size, data: iconPngs[`favicon-${size}`] })));

  const siteIconDirs = ['apps/web/public', 'apps/app/public', 'apps/docs/public', 'infra/cdn'];
  for (const dir of siteIconDirs) {
    write(join(repo, dir, 'favicon.ico'), favicon);
    write(join(repo, dir, 'apple-touch-icon.png'), iconPngs['apple-touch-icon.png']);
    if (dir === 'infra/cdn') continue;
    for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'])
      write(join(repo, dir, name), iconPngs[name]);
  }

  await page.setViewportSize({ width: 1200, height: 630 });
  const og = async (path, opts) => {
    await page.setContent(ogHtml(opts), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(`document.getElementById('h').style.fontSize = ''; (${fit.toString()})()`);
    write(path, await page.screenshot({ type: 'png' }));
  };
  // re-run the fit after fonts are ready (the inline script ran with fallback metrics)
  function fit() {
    const h = document.getElementById('h');
    for (let s = 120; s >= 56; s -= 2) {
      h.style.fontSize = `${s}px`;
      if (h.getBoundingClientRect().height <= s * 2.05 && h.scrollWidth <= 1040) break;
    }
  }

  for (const chapter of CHAPTERS) {
    const seo = CHAPTER_SEO[chapter.id];
    await og(join(repo, 'apps/web/public', ogFile(chapter.id)), {
      kicker: chapter.id === 'hero' ? '' : chapter.kicker,
      heading: chapter.title,
      emphasis: chapter.emphasis,
      caption: chapter.caption,
      foot: `windle.fun${seo.path === '/' ? '' : seo.path}`,
    });
  }
  await og(join(repo, 'apps/app/public/og.png'), {
    kicker: '',
    heading: 'SHIP OR SLASH.',
    emphasis: null,
    caption: 'Make promises with collateral behind them. Trade YES or NO on whether teams ship.',
    foot: 'app.windle.fun',
    brandSub: 'app',
  });
  await og(join(repo, 'infra/cdn/og.png'), {
    kicker: '',
    heading: 'BRAND KIT & ASSETS.',
    emphasis: null,
    caption: 'Logo marks, app icons, fonts and on-the-fly image transforms for windle.',
    foot: 'cdn.windle.fun',
    brandSub: 'cdn',
  });
} finally {
  await browser.close();
}
