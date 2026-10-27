// Bundles the api for Node 22: dist/server.js (the service), dist/migrate.js and dist/seed.js (explicit deploy steps).
// Third-party dependencies stay external (installed in the image by `npm ci --omit=dev`); workspace packages
// (@windle/*) are source-only TypeScript, so they are inlined. Type checking is `npm run typecheck` (tsc), not this.
// satori and @resvg/resvg-js (share images) are dependencies, so they stay external too: resvg is a native addon
// whose platform binary (e.g. @resvg/resvg-js-linux-x64-musl on alpine) npm installs next to it. The share-image
// fonts are read at runtime from ../assets/fonts relative to dist (see src/share/og.ts). sharp (user images, native
// libvips) is external for the same reason: npm installs its prebuilt @img/sharp-<platform> packages next to it.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@windle/'));

await build({
  entryPoints: ['src/server.ts', 'src/migrate.ts', 'src/seed.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
  define: { __WINDLE_API_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
});
