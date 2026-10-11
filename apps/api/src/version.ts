// Replaced at bundle time by build.mjs (esbuild `define`); tsx/vitest runs fall back to the dev marker.
declare const __WINDLE_API_VERSION__: string | undefined;

export const VERSION: string = typeof __WINDLE_API_VERSION__ === 'string' ? __WINDLE_API_VERSION__ : '0.0.0-dev';
