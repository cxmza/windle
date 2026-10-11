import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WINDLE_MARK_PATH, WindleMark } from './WindleMark.tsx';

const compact = (d: string) => d.replace(/\s+/g, '').replace(/,/g, '');
// vitest runs from packages/brand (jsdom's import.meta.url is not a file: URL)
const asset = (file: string) => readFileSync(resolve(process.cwd(), 'assets', file), 'utf8');

describe('WindleMark', () => {
  it('is named "windle" when standalone', () => {
    render(<WindleMark />);
    expect(screen.getByRole('img', { name: 'windle' })).toBeInTheDocument();
  });

  it('is hidden from assistive tech when decorative', () => {
    const { container } = render(<WindleMark decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('lets a consumer colour override the default accent', () => {
    const { container } = render(<WindleMark className="text-foreground" />);
    expect(container.querySelector('svg')).toHaveAttribute('class', 'shrink-0 text-foreground');
  });
});

describe('brand assets', () => {
  it.each(['favicon.svg', 'windle-mark.svg'])('%s draws the same mark', (file) => {
    expect(compact(asset(file))).toContain(compact(WINDLE_MARK_PATH));
  });
});
