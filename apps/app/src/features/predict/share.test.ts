import { describe, expect, it } from 'vitest';
import { SHARE_ORIGIN, shareLink, xIntentUrl } from './share';

const base = {
  slug: 'sprout-ships-v2',
  statement: 'Sprout ships staking v2',
  probYes: 0.624,
  tier: 'community' as const,
};

describe('share link', () => {
  it('is the short public link on the app origin', () => {
    expect(SHARE_ORIGIN).toBe('https://app.windle.fun');
    expect(shareLink({ slug: 'a-b' })).toBe('https://app.windle.fun/s/a-b');
  });

  it('prefers the url the api sent', () => {
    expect(shareLink({ slug: 'a-b', shareUrl: 'https://app.windle.fun/s/other' })).toBe(
      'https://app.windle.fun/s/other',
    );
  });
});

describe('X intent', () => {
  it('opens x.com/intent/post with the promise and odds as text and the short link as url', () => {
    const url = new URL(xIntentUrl(base));
    expect(`${url.origin}${url.pathname}`).toBe('https://x.com/intent/post');
    expect(url.searchParams.get('url')).toBe('https://app.windle.fun/s/sprout-ships-v2');
    const text = url.searchParams.get('text') ?? '';
    expect(text).toContain('Sprout ships staking v2');
    expect(text).toContain('Ships 62%');
    expect(text).toContain('practice points');
  });

  it('keeps a long statement inside a post', () => {
    const url = new URL(xIntentUrl({ ...base, tier: 'backed', statement: 'x'.repeat(400) }));
    const text = url.searchParams.get('text') ?? '';
    expect(text.length).toBeLessThan(280 - 23);
    expect(text).toContain('…');
  });

  it('encodes characters that would break the query', () => {
    const href = xIntentUrl({ ...base, statement: 'Ship & burn #1?' });
    expect(href).not.toContain('Ship & burn');
    expect(new URL(href).searchParams.get('text')).toContain('Ship & burn #1?');
  });
});
