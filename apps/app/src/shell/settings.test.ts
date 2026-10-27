import { describe, expect, it } from 'vitest';
import { settingsHref } from './settings';

describe('settingsHref', () => {
  it('adds settings=general and keeps path, other params and hash', () => {
    expect(settingsHref({ pathname: '/projects', search: '?q=ember&sort=record', hash: '#top' }, 'general')).toBe(
      '/projects?q=ember&sort=record&settings=general#top',
    );
  });

  it('works without a search string and replaces an existing settings param', () => {
    expect(settingsHref({ pathname: '/', search: '', hash: '' })).toBe('/?settings=general');
    expect(settingsHref({ pathname: '/', search: '?settings=other&m=x', hash: '' }, 'general')).toBe(
      '/?settings=general&m=x',
    );
  });
});
