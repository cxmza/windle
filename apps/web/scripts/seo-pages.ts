/**
 * Build step (run from vite.config.ts `closeBundle`): turns the single built dist/index.html into one static HTML file
 * per chapter path with its own <title>, description, canonical, Open Graph / Twitter tags and JSON-LD, plus
 * crawlable chapter text inside #root, and writes dist/sitemap.xml.
 *
 * The pre-rendered text is visually hidden (sr-only) and lives inside #root: React's createRoot replaces it on the
 * first commit, so there is no hydration (nothing to mismatch), no layout shift and no duplicate visible copy.
 * Crawlers that do not run JS (social unfurlers, most AI crawlers) still get the real chapter text and links.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  OUTCOME_LINES,
  PRELAUNCH_NOTE,
  SEO_PAGES,
  type SeoPage,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from './chapter-seo.ts';

const SEO_START = '<!-- seo:start -->';
const SEO_END = '<!-- seo:end -->';
const ROOT_EMPTY = '<div id="root"></div>';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON for an inline <script type="application/ld+json">: `<` escaped so the text can never close the tag. */
const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

function jsonLd(page: SeoPage): unknown {
  const org = `${SITE_URL}/#organization`;
  const site = `${SITE_URL}/#website`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/icon-512.png`,
          width: 512,
          height: 512,
        },
        description: SITE_DESCRIPTION,
      },
      {
        '@type': 'WebSite',
        '@id': site,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: 'en',
        publisher: { '@id': org },
      },
      {
        '@type': 'WebPage',
        '@id': `${page.url}#webpage`,
        url: page.url,
        name: page.title,
        description: page.description,
        inLanguage: 'en',
        isPartOf: { '@id': site },
        about: { '@id': org },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: page.ogImage,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
        },
      },
    ],
  };
}

export function headFor(page: SeoPage): string {
  const alt = `${page.name === 'Intro' ? 'windle' : page.name}: ${page.heading}`;
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${page.url}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    '<meta property="og:locale" content="en_US" />',
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${page.url}" />`,
    `<meta property="og:image" content="${page.ogImage}" />`,
    '<meta property="og:image:type" content="image/png" />',
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${esc(alt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${page.ogImage}" />`,
    `<meta name="twitter:image:alt" content="${esc(alt)}" />`,
    `<script type="application/ld+json">${jsonForScript(jsonLd(page))}</script>`,
  ].join('\n    ');
}

/** Crawlable chapter text; visually hidden by `.prerender` (index.html), replaced by React on mount. */
export function bodyFor(page: SeoPage): string {
  const links = SEO_PAGES.map((p) => {
    const current = p.id === page.id ? ' aria-current="page"' : '';
    const label = p.id === 'hero' ? 'windle — ship or slash' : `${p.name}${p.summary ? ` — ${p.summary}` : ''}`;
    return `<li><a href="${p.path}"${current}>${esc(label)}</a></li>`;
  }).join('');
  const outcomes =
    page.id === 'outcome' || page.id === 'hero'
      ? `<ul>${OUTCOME_LINES.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
      : '';
  return [
    '<div id="root"><div class="prerender" data-prerender>',
    `<p>${esc(page.kicker)}</p>`,
    `<h1>${esc(page.heading)}</h1>`,
    `<p>${esc(page.caption)}</p>`,
    outcomes,
    `<h2>What is windle?</h2><p>${esc(SITE_DESCRIPTION)}</p>`,
    `<p>${esc(PRELAUNCH_NOTE)}</p>`,
    `<nav aria-label="Chapters"><h2>The story</h2><ul>${links}</ul></nav>`,
    '<p><a href="https://docs.windle.fun/">Documentation</a> · <a href="https://app.windle.fun/">App</a></p>',
    '</div></div>',
  ].join('');
}

function sitemap(date: string): string {
  const urls = SEO_PAGES.map(
    (p) =>
      `  <url>\n    <loc>${p.url}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${p.id === 'hero' ? '1.0' : '0.8'}</priority>\n  </url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function writeSeoPages(outDir: string, date = new Date().toISOString().slice(0, 10)): string[] {
  const template = readFileSync(join(outDir, 'index.html'), 'utf8');
  const start = template.indexOf(SEO_START);
  const end = template.indexOf(SEO_END);
  if (start < 0 || end < start) throw new Error(`windle:seo-pages: ${SEO_START} … ${SEO_END} block not found`);
  if (!template.includes(ROOT_EMPTY)) throw new Error(`windle:seo-pages: ${ROOT_EMPTY} not found`);

  const written: string[] = [];
  for (const page of SEO_PAGES) {
    const html =
      template.slice(0, start) +
      `${SEO_START}\n    ${headFor(page)}\n    ` +
      template.slice(end).replace(ROOT_EMPTY, () => bodyFor(page));
    writeFileSync(join(outDir, page.file), html);
    written.push(page.file);
  }
  writeFileSync(join(outDir, 'sitemap.xml'), sitemap(date));
  written.push('sitemap.xml');
  return written;
}
