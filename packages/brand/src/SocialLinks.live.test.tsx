import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialLinks } from './SocialLinks.tsx';
import { SOCIALS } from './socials.ts';

describe('SocialLinks with the real config', () => {
  it('renders every configured link as a safe external anchor', () => {
    render(<SocialLinks />);
    for (const [slot, href] of Object.entries(SOCIALS)) {
      if (href === null) continue;
      const link = document.querySelector(`a[data-social="${slot}"]`);
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('target', '_blank');
    }
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });
});
