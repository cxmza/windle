import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to.ts';

describe('safeReturnTo', () => {
  it.each(['https://app.windle.fun/', 'https://windle.fun/x?y=1', 'https://docs.windle.fun/a#b'])(
    'allows %s',
    (url) => {
      expect(safeReturnTo(url)).toBe(url);
    },
  );

  it.each([
    null,
    '',
    '/relative',
    'http://app.windle.fun/',
    'https://evilwindle.fun/',
    'https://windle.fun.evil.com/',
    'https://user:pass@app.windle.fun/',
    'javascript:alert(1)',
  ])('rejects %s', (url) => {
    expect(safeReturnTo(url)).toBeNull();
  });
});
