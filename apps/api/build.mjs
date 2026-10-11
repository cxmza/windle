// Bundles the api for Node 22: dist/server.js (the service) and dist/migrate.js (explicit deploy step).
// Third-party dependencies stay external (installed in the image by `npm ci --omit=dev`); workspace packages
// (@windle/*) are source-only TypeScript, so they are inlined. Type checking is `npm run typecheck` (tsc), not this.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@windle/'));

await build({
  entryPoints: ['src/server.ts', 'src/migrate.ts'],
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
