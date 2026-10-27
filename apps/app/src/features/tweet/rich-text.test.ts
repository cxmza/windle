import { describe, expect, it } from 'vitest';
import { tokenizeRich } from './rich-text';

const urls = [
  { url: 'https://t.co/abc', expandedUrl: 'https://example.com/long/path', displayUrl: 'example.com/long/path' },
];

describe('tokenizeRich', () => {
  it('replaces a t.co link with its display address and real target', () => {
    const t = tokenizeRich('see https://t.co/abc now', urls, false);
    expect(t.map((x) => (x.kind === 'link' ? `${x.text}=>${x.href}` : x.text))).toEqual([
      'see ',
      'example.com/long/path=>https://example.com/long/path',
      ' now',
    ]);
  });

  it('drops a trailing t.co link when the post has media or a quote', () => {
    const t = tokenizeRich('look https://t.co/zzz', [], true);
    expect(t.map((x) => x.text).join('')).toBe('look');
  });

  it('keeps a trailing t.co link when there is nothing it could stand for', () => {
    const t = tokenizeRich('look https://t.co/zzz', [], false);
    expect(t.map((x) => x.text).join('')).toContain('t.co/zzz');
  });

  it('links mentions, hashtags and cashtags', () => {
    const t = tokenizeRich('@a #b $CC', undefined, false);
    expect(t.filter((x) => x.kind === 'link').map((x) => x.kind === 'link' && x.type)).toEqual([
      'mention',
      'hashtag',
      'cashtag',
    ]);
  });
});
