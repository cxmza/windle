#!/usr/bin/env node
// Generates the cdn brand kit + favicons from the single sources of truth:
//   shape  -> packages/brand/assets/windle-mark.svg (path data)
//   colour -> packages/tokens/src/palette.ts (BLUE[500] = --accent, NEUTRAL.black/white)
//
//   node infra/scripts/build-brand.mjs           # (re)write the files
//   node infra/scripts/build-brand.mjs --check   # exit 1 if any generated file drifted
//
// Outputs (committed, deployed as part of the cdn release / placeholders):
//   infra/cdn/brand/windle-mark-{blue,white,black}.svg, infra/cdn/brand/windle-app-icon.svg,
//   infra/cdn/favicon.svg, infra/placeholders/favicon.svg (copy of packages/brand/assets/favicon.svg)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const markSvg = read('packages/brand/assets/windle-mark.svg');
const d = markSvg.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
if (!d) throw new Error('no path data in packages/brand/assets/windle-mark.svg');

const palette = read('packages/tokens/src/palette.ts');
const hex = (re, name) => {
  const v = palette.match(re)?.[1];
  if (!v) throw new Error(`palette.ts: ${name} not found`);
  return v;
};
const blue = hex(/\b500:\s*'(#[0-9a-f]{6})'/i, 'BLUE[500]');
const black = hex(/\bblack:\s*'(#[0-9a-f]{6})'/i, 'NEUTRAL.black');
const white = hex(/\bwhite:\s*'(#[0-9a-f]{6})'/i, 'NEUTRAL.white');

const svg = (body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><title>${title}</title>${body}</svg>\n`;
const mark = (fill, extra = '') => `<path fill="${fill}"${extra} d="${d}"/>`;

const favicon = read('packages/brand/assets/favicon.svg');
const files = {
  'infra/cdn/brand/windle-mark-blue.svg': svg(mark(blue), 'windle'),
  'infra/cdn/brand/windle-mark-white.svg': svg(mark(white), 'windle'),
  'infra/cdn/brand/windle-mark-black.svg': svg(mark(black), 'windle'),
  'infra/cdn/brand/windle-app-icon.svg': svg(
    `<rect width="120" height="120" rx="26" fill="${black}"/>${mark(blue, ' transform="translate(12 12) scale(0.8)"')}`,
    'windle app icon',
  ),
  'infra/cdn/favicon.svg': favicon,
  'infra/placeholders/favicon.svg': favicon,
};

const check = process.argv.includes('--check');
let drift = 0;
for (const [path, content] of Object.entries(files)) {
  let current = null;
  try {
    current = read(path);
  } catch {}
  if (current === content) continue;
  if (check) {
    drift++;
    console.error(`drift: ${path}`);
  } else {
    writeFileSync(join(root, path), content);
    console.log(`wrote ${relative(root, join(root, path))}`);
  }
}
if (check && drift) process.exit(1);
if (check) console.log('brand kit in sync');
