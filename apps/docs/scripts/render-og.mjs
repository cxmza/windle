// Renders public/og.png (1200x630 Open Graph image) from the HTML below with headless Chromium.
// Brand fonts are inlined from @fontsource-variable (deps of @windle/tokens), the mark from packages/brand.
// Playwright is not a docs dependency: it is hoisted from apps/web. Run from the repo root:
//   node apps/docs/scripts/render-og.mjs
// The PNG is committed; re-run only when the design changes.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(here, '..');
const require = createRequire(import.meta.url);

/** base64 data URL of the latin, variable-weight woff2 of a Fontsource package. */
function fontDataUrl(pkg) {
  const dir = join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  const file = readdirSync(dir).find((f) => /-latin-wght-normal\.woff2$/.test(f));
  if (!file) throw new Error(`no latin wght woff2 in ${dir}`);
  return `data:font/woff2;base64,${readFileSync(join(dir, file)).toString('base64')}`;
}

const markPath = readFileSync(join(docsRoot, '../../packages/brand/assets/windle-mark.svg'), 'utf8').match(
  / d="([^"]+)"/,
)?.[1];
if (!markPath) throw new Error('mark path not found');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Unbounded; src: url(${fontDataUrl('@fontsource-variable/unbounded')}) format('woff2'); font-weight: 200 900; }
@font-face { font-family: Inter Tight; src: url(${fontDataUrl('@fontsource-variable/inter-tight')}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; }
body {
  width: 1200px; height: 630px; box-sizing: border-box; padding: 72px 80px; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between;
  color: #fff; font-family: 'Inter Tight', sans-serif;
  background:
    radial-gradient(60% 70% at 85% 95%, rgb(9 61 161 / 0.55), transparent 70%),
    radial-gradient(90% 90% at 75% 110%, rgb(0 18 76 / 0.8), transparent 75%),
    #000;
}
.top { display: flex; align-items: center; gap: 20px; }
.top svg { width: 64px; height: 64px; color: #1c69e3; filter: drop-shadow(0 0 24px rgb(108 211 250 / 0.35)); }
.brand { font-family: Unbounded; font-weight: 600; font-size: 34px; letter-spacing: -0.02em; }
.brand span { color: #43acfb; font-weight: 400; }
h1 { margin: 0; font-family: Unbounded; font-weight: 700; font-size: 112px; line-height: 0.98; letter-spacing: -0.035em; }
p { margin: 24px 0 0; max-width: 860px; font-size: 32px; line-height: 1.3; color: #d1d1d1; }
.foot { display: flex; justify-content: space-between; font-size: 22px; letter-spacing: 0.18em; text-transform: uppercase; color: #a5a5a5; }
.foot b { color: #6cd3fa; font-weight: 500; }
</style></head><body>
<div class="top"><svg viewBox="0 0 120 120"><path fill="currentColor" d="${markPath}"/></svg><div class="brand">windle <span>docs</span></div></div>
<div><h1>SHIP OR SLASH.</h1><p>Promises with collateral behind them, markets pricing them, the chain as the judge.</p></div>
<div class="foot"><span>Solana protocol · pre-launch</span><b>docs.windle.fun</b></div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(docsRoot, 'public/og.png'), type: 'png' });
  console.log('wrote public/og.png');
} finally {
  await browser.close();
}
