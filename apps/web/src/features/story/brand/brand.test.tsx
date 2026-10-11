/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { WINDLE_MARK_PATH } from '@windle/brand';
import { describe, expect, it } from 'vitest';
import { WindleLogo } from './WindleLogo';

// WindleMark itself is tested in packages/brand.
describe('WindleLogo', () => {
  it('reads as the lowercase wordmark, with the mark decorative', () => {
    const { container } = render(<WindleLogo />);
    expect(screen.getByText('windle')).toBeInTheDocument();
    expect(container.querySelector('[data-windle-mark]')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[data-logo-jelly]')).not.toBeNull();
  });
});

describe('brand assets', () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8'); // vitest runs from apps/web

  it('links the favicon and sets the title in index.html', () => {
    const html = read('index.html');
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
    expect(html).toContain('<title>windle — ship or slash</title>');
  });

  it('draws the same mark in the favicon', () => {
    const compact = (d: string) => d.replace(/\s+/g, '').replace(/,/g, '');
    expect(compact(read('public/favicon.svg'))).toContain(compact(WINDLE_MARK_PATH));
  });

  it('ships the favicon from packages/brand unchanged', () => {
    expect(read('public/favicon.svg')).toBe(read('../../packages/brand/assets/favicon.svg'));
  });
});
