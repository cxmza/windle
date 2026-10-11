/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { writeSeoPages } from './scripts/seo-pages.ts';

/**
 * Preload the two latin woff2 files the first viewport renders with (h1: Unbounded, body: Inter Tight). Without it
 * they are discovered only after the CSS is parsed and the first styled layout runs; their late swap shifted the hero
 * (CLS 0.10 desktop / 0.06 mobile on production). Caveat (margin notes) is not preloaded: no text uses it above the fold.
 */
function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: 'windle:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => patterns.some((re) => re.test(f)));
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: `/${f}`, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

/**
 * After the bundle is written: one static HTML per chapter path (own title/description/canonical/OG/JSON-LD and
 * crawlable chapter text) + sitemap.xml. See scripts/seo-pages.ts; nginx maps /<chapter> to /<chapter>.html.
 */
function seoPages(): Plugin {
  let outDir = 'dist';
  return {
    name: 'windle:seo-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = writeSeoPages(outDir);
      this.info(`seo pages: ${files.join(', ')}`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    preloadFonts([/unbounded-latin-wght-normal-[\w-]+\.woff2$/, /inter-tight-latin-wght-normal-[\w-]+\.woff2$/]),
    seoPages(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
