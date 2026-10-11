/** Apex domain every first-party app lives under. */
export const WINDLE_APEX = 'windle.fun';

/**
 * `?return_to=` allow-list for the auth app: only https URLs on windle.fun or a subdomain of it.
 * Returns the normalised URL string, or null when the value must be ignored (fall back to the app).
 */
export function safeReturnTo(value: string | null | undefined, apex: string = WINDLE_APEX): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== apex && !host.endsWith(`.${apex}`)) return null;
  return url.toString();
}
