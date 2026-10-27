import { describe, expect, it } from 'vitest';
import { displayUrl, safeHref, tokenizeTweet } from './linkify';

describe('safeHref', () => {
  it('lets http and https through and nothing else', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('http://example.com')).toBe('http://example.com/');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('not a url')).toBeNull();
  });
});

describe('tokenizeTweet', () => {
  it('links urls, mentions and hashtags and keeps the rest as text', () => {
    const tokens = tokenizeTweet('v2 is live, see https://kestrel.xyz/v2. cc @kestrel_hq #Solana');
    expect(tokens).toEqual([
      { kind: 'text', at: 0, text: 'v2 is live, see ' },
      { kind: 'link', at: 16, type: 'url', text: 'https://kestrel.xyz/v2', href: 'https://kestrel.xyz/v2' },
      { kind: 'text', at: 38, text: '. cc ' },
      { kind: 'link', at: 43, type: 'mention', text: '@kestrel_hq', href: 'https://x.com/kestrel_hq' },
      { kind: 'text', at: 54, text: ' ' },
      { kind: 'link', at: 55, type: 'hashtag', text: '#Solana', href: 'https://x.com/hashtag/Solana' },
    ]);
  });

  it('never turns markup or script schemes into links', () => {
    const text = '<img src=x onerror=alert(1)> javascript:alert(1) <script>alert(2)</script>';
    const tokens = tokenizeTweet(text);
    expect(tokens.every((t) => t.kind === 'text')).toBe(true);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
  });

  it('does not treat an email address as a mention', () => {
    const tokens = tokenizeTweet('mail team@kestrel.xyz');
    expect(tokens.filter((t) => t.kind === 'link' && t.type === 'mention')).toHaveLength(0);
  });

  it('shortens long urls for display', () => {
    expect(displayUrl('https://www.example.com/')).toBe('example.com');
    expect(displayUrl(`https://example.com/${'a'.repeat(60)}`).length).toBe(32);
  });

  it('links cashtags to an x.com search but not plain amounts', () => {
    const tokens = tokenizeTweet('ship $GLOW via @glowbyte_sol #solana, see https://example.com/a?b=1.');
    expect(tokens.filter((t) => t.kind === 'link').map((t) => t.kind === 'link' && [t.text, t.href])).toEqual([
      ['$GLOW', 'https://x.com/search?q=%24GLOW'],
      ['@glowbyte_sol', 'https://x.com/glowbyte_sol'],
      ['#solana', 'https://x.com/hashtag/solana'],
      ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ]);
    expect(tokens.at(-1)).toMatchObject({ kind: 'text', text: '.' });
    expect(tokenizeTweet('costs $50 today').every((t) => t.kind === 'text')).toBe(true);
  });

  it('keeps token offsets and loses no characters', () => {
    const text = 'a @b c';
    const tokens = tokenizeTweet(text);
    expect(tokens.map((t) => t.at)).toEqual([0, 2, 4]);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
  });
});
