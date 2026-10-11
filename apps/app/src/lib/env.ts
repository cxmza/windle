const read = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value.replace(/\/+$/, '') : fallback;

/** Backend base URL. Prod https://api.windle.fun, dev http://127.0.0.1:3001 (override with VITE_API_URL). */
export const API_URL = read(
  import.meta.env.VITE_API_URL,
  import.meta.env.DEV ? 'http://127.0.0.1:3001' : 'https://api.windle.fun',
);

/** Sign-in app. Anonymous visitors are sent here with `?return_to=`. */
export const AUTH_URL = read(
  import.meta.env.VITE_AUTH_URL,
  import.meta.env.DEV ? 'http://localhost:5175' : 'https://oauth.windle.fun',
);

/** True when the configured API is on this machine: unreachable then most likely means "not started". */
export const IS_LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(API_URL);
