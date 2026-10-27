const HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com', 'www.x.com', 'www.twitter.com']);
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_ID = /^\d{5,25}$/;

export type TweetUrlErrorCode =
  | 'invalid_url'
  | 'unsupported_host'
  | 'not_a_status'
  | 'invalid_handle'
  | 'invalid_status_id';

export type ParsedTweetUrl =
  | { readonly ok: true; readonly handle: string; readonly statusId: string }
  | { readonly ok: false; readonly code: TweetUrlErrorCode; readonly message: string };

const fail = (code: TweetUrlErrorCode, message: string): ParsedTweetUrl => ({ ok: false, code, message });

/**
 * Extracts `{ handle, statusId }` from a tweet link. Accepts x.com / twitter.com (www and mobile hosts), a missing
 * scheme, query strings, fragments, trailing slashes and the `/i/web/status/<id>` and `/<handle>/status/<id>/photo/1`
 * shapes. The handle is returned as written; `/i/...` links have no handle and report `i`.
 */
export function parseTweetUrl(input: string): ParsedTweetUrl {
  const raw = input.trim();
  if (!raw) return fail('invalid_url', 'Paste a link to a tweet.');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return fail('invalid_url', 'That does not look like a link.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return fail('invalid_url', 'That does not look like a link.');
  if (!HOSTS.has(url.hostname.toLowerCase()))
    return fail('unsupported_host', 'Only x.com and twitter.com links are supported.');

  const parts = url.pathname.split('/').filter(Boolean);
  const [handle, kind, statusId] = parts;
  if (
    handle === undefined ||
    kind === undefined ||
    (kind !== 'status' && kind !== 'statuses' && !(handle === 'i' && kind === 'web'))
  ) {
    return fail('not_a_status', 'This link is not a single tweet. Open the tweet and copy its link.');
  }
  if (handle === 'i') {
    const id = parts[3];
    if (id === undefined || !STATUS_ID.test(id))
      return fail('invalid_status_id', 'The tweet id in this link is not valid.');
    return { ok: true, handle: 'i', statusId: id };
  }
  if (!HANDLE.test(handle)) return fail('invalid_handle', 'The account name in this link is not valid.');
  if (statusId === undefined || !STATUS_ID.test(statusId))
    return fail('invalid_status_id', 'The tweet id in this link is not valid.');
  return { ok: true, handle, statusId };
}

export const tweetUrl = (handle: string, statusId: string): string => `https://x.com/${handle}/status/${statusId}`;
