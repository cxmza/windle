const read = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value.replace(/\/+$/, '') : fallback;

/** Backend base URL. Prod https://api.windle.fun, dev http://127.0.0.1:3001 (override with VITE_API_URL). */
export const API_URL = read(
  import.meta.env.VITE_API_URL,
  import.meta.env.DEV ? 'http://127.0.0.1:3001' : 'https://api.windle.fun',
);

/** Where to land when there is no (valid) `?return_to=`. */
export const APP_URL = read(
  import.meta.env.VITE_APP_URL,
  import.meta.env.DEV ? 'http://localhost:5174' : 'https://app.windle.fun',
);

/** Legal pages live in the docs site (placeholders until the texts are written). */
export const DOCS_URL = read(import.meta.env.VITE_DOCS_URL, 'https://docs.windle.fun');

/** The marketing site (back link). */
export const WEB_URL = read(
  import.meta.env.VITE_WEB_URL,
  import.meta.env.DEV ? 'http://localhost:5173' : 'https://www.windle.fun',
);
