import { describe, expect, it } from 'vitest';
import { CHAPTER_SEO } from '../../../scripts/chapter-seo.ts';
import { CHAPTERS } from './chapters';
import { CHAPTER_PATHS, chapterFromPath, chapterTitle } from './routes';

describe('routes', () => {
  it('gives every chapter a unique clean path', () => {
    const paths = CHAPTERS.map((c) => CHAPTER_PATHS[c.id]);
    expect(new Set(paths).size).toBe(CHAPTERS.length);
    expect(paths).toEqual([
      '/',
      '/promise',
      '/collateral',
      '/market',
      '/incentive',
      '/judge',
      '/outcome',
      '/ecosystem',
      '/launch',
    ]);
    for (const p of paths) expect(p).not.toContain('#');
  });

  it('maps a pathname back to its chapter, tolerating a trailing slash, and rejects unknown paths', () => {
    expect(chapterFromPath('/')).toBe('hero');
    expect(chapterFromPath('/market')).toBe('market');
    expect(chapterFromPath('/market/')).toBe('market');
    expect(chapterFromPath('/launch')).toBe('cta');
    expect(chapterFromPath('/cta')).toBeNull();
    expect(chapterFromPath('/nope')).toBeNull();
    expect(chapterFromPath('/market/x')).toBeNull();
  });

  it('titles chapters "Name - windle"', () => {
    expect(chapterTitle('market')).toBe(CHAPTER_SEO.market.title);
    expect(chapterTitle('hero')).toContain('windle');
  });
});

describe('CHAPTER_SEO', () => {
  it('has exactly the chapters and paths of CHAPTER_PATHS', () => {
    expect(Object.keys(CHAPTER_SEO).sort()).toEqual(Object.keys(CHAPTER_PATHS).sort());
    for (const [id, path] of Object.entries(CHAPTER_PATHS)) {
      expect(CHAPTER_SEO[id as keyof typeof CHAPTER_SEO].path).toBe(path);
    }
  });
});
