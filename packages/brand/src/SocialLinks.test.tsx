import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocialLinks, socialEntries } from './SocialLinks.tsx';

vi.mock('./socials.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./socials.ts')>()),
  SOCIALS: { x: null, github: 'https://github.com/cxmza/windle' },
}));

describe('SocialLinks with an unset entry', () => {
  it('drops it outside dev', () => {
    expect(socialEntries(false).map((e) => e.slot)).toEqual(['github']);
    render(<SocialLinks />);
    expect(screen.getByRole('link', { name: /windle on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/cxmza/windle',
    );
    expect(screen.queryByRole('img', { name: /X link not set/ })).toBeNull();
  });

  it('shows an inert, labelled stand-in in dev, never a link', () => {
    render(<SocialLinks showPlaceholders />);
    const stand = screen.getByRole('img', { name: 'X link not set' });
    expect(stand).toHaveAttribute('data-placeholder');
    expect(stand.tagName).toBe('SPAN');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
