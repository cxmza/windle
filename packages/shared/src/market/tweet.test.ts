import { describe, expect, it } from 'vitest';
import { parseTweetUrl, tweetUrl } from './tweet.ts';

const ID = '1846302918475639201';

describe('parseTweetUrl', () => {
  it.each([
    [`https://x.com/sproutfi_dev/status/${ID}`],
    [`https://twitter.com/sproutfi_dev/status/${ID}`],
    [`https://www.twitter.com/sproutfi_dev/status/${ID}`],
    [`https://mobile.twitter.com/sproutfi_dev/status/${ID}`],
    [`https://x.com/sproutfi_dev/status/${ID}?s=20&t=abc123`],
    [`https://x.com/sproutfi_dev/status/${ID}/`],
    [`https://x.com/sproutfi_dev/status/${ID}/photo/1`],
    [`https://x.com/sproutfi_dev/status/${ID}#reply`],
    [`  x.com/sproutfi_dev/status/${ID}  `],
    [`http://X.COM/sproutfi_dev/status/${ID}`],
  ])('accepts %s', (url) => {
    expect(parseTweetUrl(url)).toEqual({ ok: true, handle: 'sproutfi_dev', statusId: ID });
  });

  it('accepts the handle-less web form', () => {
    expect(parseTweetUrl(`https://x.com/i/web/status/${ID}`)).toEqual({ ok: true, handle: 'i', statusId: ID });
  });

  it.each([
    ['', 'invalid_url'],
    ['not a url at all', 'invalid_url'],
    ['javascript://x.com/a/status/12345', 'invalid_url'],
    [`https://example.com/a/status/${ID}`, 'unsupported_host'],
    [`https://x.com.evil.com/a/status/${ID}`, 'unsupported_host'],
    ['https://x.com/sproutfi_dev', 'not_a_status'],
    ['https://x.com/sproutfi_dev/likes', 'not_a_status'],
    ['https://x.com/home', 'not_a_status'],
    [`https://x.com/way_too_long_handle_name/status/${ID}`, 'invalid_handle'],
    ['https://x.com/sproutfi_dev/status/abc', 'invalid_status_id'],
    ['https://x.com/sproutfi_dev/status/', 'invalid_status_id'],
  ])('rejects %j with %s', (url, code) => {
    const r = parseTweetUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it('builds the canonical url', () => {
    expect(tweetUrl('a_b', ID)).toBe(`https://x.com/a_b/status/${ID}`);
  });
});
