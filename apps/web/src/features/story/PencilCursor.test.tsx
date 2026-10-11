import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PencilCursor } from './PencilCursor';

function mockMedia(matching: (query: string) => boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('PencilCursor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mounts an inert aria-hidden overlay on a fine pointer', () => {
    mockMedia((q) => q.includes('pointer: fine'));
    const { container } = render(<PencilCursor />);
    const el = container.querySelector('[data-pencil-cursor]');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('pointer-events-none', 'fixed');
    expect(container.querySelector('[data-pencil-trail]')).not.toBeNull();
    expect(container.querySelector('[data-pencil-sketch]')).not.toBeNull();
  });

  it('renders nothing on touch / coarse pointers', () => {
    mockMedia(() => false);
    const { container } = render(<PencilCursor />);
    expect(container.querySelector('[data-pencil-cursor]')).toBeNull();
  });

  it('renders nothing under reduced motion', () => {
    mockMedia((q) => q.includes('reduce') || q.includes('pointer: fine'));
    const { container } = render(<PencilCursor />);
    expect(container.querySelector('[data-pencil-cursor]')).toBeNull();
  });
});
