import { describe, expect, it } from 'vitest';
import { isSolanaAddress, pumpFunUrl, SOCIALS, shortAddress, tokenCa } from './socials.ts';
import { resolveCa } from './use-token-ca.ts';

const MINT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('socials config', () => {
  it('never holds a bare site root as a link', () => {
    for (const href of Object.values(SOCIALS)) {
      if (href !== null) expect(new URL(href).pathname.length).toBeGreaterThan(1);
    }
  });

  it('exposes the launched pump.fun token CA', () => {
    expect(tokenCa()).toBe('E4mQ9PH1BVgVdYwiQeh8ZNv4YTEVo7gjR81q4mZGpump');
  });
});

describe('isSolanaAddress', () => {
  it('accepts a base58 mint and rejects look-alikes', () => {
    expect(isSolanaAddress(MINT)).toBe(true);
    expect(isSolanaAddress('')).toBe(false);
    expect(isSolanaAddress(`${MINT}0`)).toBe(false);
    expect(isSolanaAddress(MINT.slice(0, 20))).toBe(false);
    expect(isSolanaAddress(`${MINT} `)).toBe(false);
  });
});

describe('pumpFunUrl', () => {
  it('points at the coin page', () => {
    expect(pumpFunUrl(MINT)).toBe(`https://pump.fun/coin/${MINT}`);
  });
});

describe('shortAddress', () => {
  it('keeps head and tail', () => {
    expect(shortAddress(MINT)).toBe('7xKX…gAsU');
    expect(shortAddress(MINT, 6, 5)).toBe('7xKXtg…sgAsU');
  });
  it('leaves short strings alone', () => {
    expect(shortAddress('abc')).toBe('abc');
  });
});

describe('resolveCa', () => {
  it('always returns the configured CA, so ?previewCa can never override the real contract', () => {
    expect(resolveCa(`?previewCa=${MINT}`, true)).toBe('E4mQ9PH1BVgVdYwiQeh8ZNv4YTEVo7gjR81q4mZGpump');
    expect(resolveCa(`?previewCa=${MINT}`, false)).toBe('E4mQ9PH1BVgVdYwiQeh8ZNv4YTEVo7gjR81q4mZGpump');
    expect(resolveCa('', false)).toBe('E4mQ9PH1BVgVdYwiQeh8ZNv4YTEVo7gjR81q4mZGpump');
  });
});
