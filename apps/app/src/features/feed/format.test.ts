import { describe, expect, it } from 'vitest';
import { plural } from './format';

describe('plural', () => {
  it('counts', () => {
    expect(plural(1, 'new post')).toBe('1 new post');
    expect(plural(3, 'new post')).toBe('3 new posts');
  });
});
