// @ts-check
import starlight from '@astrojs/starlight';
import { BLUE } from '@windle/tokens';
import { defineConfig } from 'astro/config';

const SITE = 'https://docs.windle.fun';
const OG_IMAGE = `${SITE}/og.png`;
const JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.windle.fun/#organization',
      name: 'windle',
      url: 'https://www.windle.fun/',
      logo: { '@type': 'ImageObject', url: 'https://www.windle.fun/icon-512.png', width: 512, height: 512 },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: 'windle docs',
      inLanguage: 'en',
      publisher: { '@id': 'https://www.windle.fun/#organization' },
    },
  ],
}).replace(/</g, '\\u003c');

// Static build (dist/) served by host nginx at docs.windle.fun (infra/nginx/sites/windle-50-docs.conf).
// build.format 'directory' -> /concepts/promise/index.html, served as /concepts/promise/ (clean URLs).
export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  server: { port: 4321 },
  integrations: [
    starlight({
      title: 'windle docs',
      description:
        'windle: teams lock collateral behind onchain-verifiable promises, a YES/NO market prices them, and the chain resolves them at the deadline.',
      // Blue mark from @windle/brand (single source; windle-mark.svg itself is currentColor, invisible as an <img>).
      logo: { src: '../../packages/brand/assets/favicon.svg' },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      // Dark-only, like every other windle surface (packages/tokens has no light theme).
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        Footer: './src/components/Footer.astro',
        // X placeholder link lives here, not in `social` (see the component for why).
        SocialIcons: './src/components/SocialIcons.astro',
      },
      lastUpdated: false,
      pagefind: true,
      expressiveCode: {
        themes: ['github-dark-default'],
        styleOverrides: {
          borderRadius: '0.875rem',
          borderColor: '#ffffff17',
          codeBackground: BLUE[50],
          codeFontSize: '0.875rem',
          codeLineHeight: '1.7',
          codePaddingBlock: '1rem',
          codePaddingInline: '1.25rem',
          codeFontFamily: 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
          uiFontFamily: '"Inter Tight Variable", ui-sans-serif, system-ui, sans-serif',
          frames: {
            editorTabBarBackground: BLUE[100],
            editorActiveTabBackground: BLUE[50],
            editorActiveTabIndicatorTopColor: BLUE[700],
            editorTabBarBorderBottomColor: '#ffffff0f',
            terminalTitlebarBackground: BLUE[100],
            terminalBackground: BLUE[50],
            frameBoxShadowCssValue: 'none',
          },
        },
      },
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#000000' } },
        { tag: 'meta', attrs: { name: 'format-detection', content: 'telephone=no' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '48x48' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
        // Same Organization @id as www.windle.fun, so search engines merge the entity across both hosts.
        { tag: 'script', attrs: { type: 'application/ld+json' }, content: JSON_LD },
        { tag: 'meta', attrs: { property: 'og:image', content: OG_IMAGE } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        {
          tag: 'meta',
          attrs: { property: 'og:image:alt', content: 'windle docs: ship or slash. Promises with collateral.' },
        },
        { tag: 'meta', attrs: { name: 'twitter:image', content: OG_IMAGE } },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: ['introduction', 'how-it-works'],
        },
        {
          label: 'Concepts',
          items: [
            'concepts/promise',
            'concepts/collateral',
            'concepts/market',
            'concepts/resolution',
            'concepts/payouts',
          ],
        },
        {
          label: 'Guides',
          items: [
            { slug: 'guides/teams', badge: { text: 'Soon', variant: 'note' } },
            { slug: 'guides/traders', badge: { text: 'Soon', variant: 'note' } },
            'guides/sign-in',
          ],
        },
        {
          label: 'API',
          items: [
            { slug: 'api/overview', badge: { text: 'Early', variant: 'caution' } },
            'api/auth',
            {
              label: 'Reference',
              link: 'https://api.windle.fun/reference',
              attrs: { target: '_blank', rel: 'noopener' },
            },
          ],
        },
        {
          label: 'Resources',
          items: ['faq', 'brand', 'changelog'],
        },
        {
          label: 'Legal',
          badge: { text: 'Draft', variant: 'caution' },
          items: ['legal/risk', 'legal/terms', 'legal/privacy'],
        },
      ],
    }),
  ],
});
