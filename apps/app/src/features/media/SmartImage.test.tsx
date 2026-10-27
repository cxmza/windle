import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPrefs, setPref } from '@/features/settings/prefs';
import { presetSize, SmartImage } from './SmartImage';
import { makeImage } from './test-support';

afterEach(() => {
  cleanup();
  resetPrefs();
});

const image = makeImage(1, { width: 800, height: 600 });
const wrapper = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-smart-image]');
const blur = (c: HTMLElement) => c.querySelector<HTMLImageElement>('[data-placeholder]');

describe('SmartImage', () => {
  it('shows the ThumbHash blur at once and the real image only after it has loaded', () => {
    const { container } = render(<SmartImage image={image} preset="card" alt="Glowbyte logo" />);
    expect(wrapper(container)).toHaveAttribute('data-status', 'loading');
    expect(blur(container)?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(blur(container)).toHaveClass('opacity-100');
    const real = screen.getByRole('img', { name: 'Glowbyte logo' });
    expect(real).toHaveClass('opacity-0');

    fireEvent.load(real);
    expect(wrapper(container)).toHaveAttribute('data-status', 'loaded');
    expect(real).toHaveClass('opacity-100');
    expect(blur(container)).toHaveClass('opacity-0');
  });

  it('keeps the blur and shows a quiet icon when the image fails', () => {
    const { container } = render(<SmartImage image={image} preset="card" alt="Logo" />);
    fireEvent.error(screen.getByRole('img', { name: 'Logo' }));
    expect(wrapper(container)).toHaveAttribute('data-status', 'error');
    expect(container.querySelector('[data-image-error]')).toBeInTheDocument();
    expect(blur(container)).toHaveClass('opacity-100');
  });

  it('reserves its box from the preset: explicit size and aspect ratio, so nothing shifts', () => {
    const { container } = render(<SmartImage image={image} preset="card" alt="Logo" />);
    const real = screen.getByRole('img', { name: 'Logo' });
    expect(real).toHaveAttribute('width', '480');
    expect(real).toHaveAttribute('height', '360');
    expect(wrapper(container)?.style.aspectRatio).toBe('480 / 360');
    expect(presetSize(image, 'avatar64')).toEqual({ width: 64, height: 64 });
    expect(presetSize(image, 'cover')).toEqual({ width: 800, height: 600 });
    expect(presetSize(image, 'og')).toEqual({ width: 1200, height: 630 });
  });

  it('is lazy and async by default, eager and high priority above the fold', () => {
    const { rerender } = render(<SmartImage image={image} preset="card" alt="Logo" />);
    const lazy = screen.getByRole('img', { name: 'Logo' });
    expect(lazy).toHaveAttribute('loading', 'lazy');
    expect(lazy).toHaveAttribute('decoding', 'async');
    expect(lazy).toHaveAttribute('fetchpriority', 'auto');
    rerender(<SmartImage image={image} preset="card" alt="Logo" priority />);
    const eager = screen.getByRole('img', { name: 'Logo' });
    expect(eager).toHaveAttribute('loading', 'eager');
    expect(eager).toHaveAttribute('fetchpriority', 'high');
  });

  it('offers the 1x and 2x avatars, and card with cover by width', () => {
    const { rerender } = render(<SmartImage image={image} preset="avatar64" alt="Me" />);
    const avatar = screen.getByRole('img', { name: 'Me' });
    expect(avatar).toHaveAttribute('src', image.urls.avatar64);
    expect(avatar).toHaveAttribute('srcset', `${image.urls.avatar64} 1x, ${image.urls.avatar128} 2x`);
    rerender(<SmartImage image={image} preset="card" alt="Me" sizes="(min-width: 768px) 480px, 100vw" />);
    const card = screen.getByRole('img', { name: 'Me' });
    expect(card).toHaveAttribute('srcset', `${image.urls.card} 480w, ${image.urls.cover} 800w`);
    expect(card).toHaveAttribute('sizes', '(min-width: 768px) 480px, 100vw');
  });

  it('starts over in loading when the image changes', () => {
    const { container, rerender } = render(<SmartImage image={image} preset="thumb" alt="Logo" />);
    fireEvent.load(screen.getByRole('img', { name: 'Logo' }));
    expect(wrapper(container)).toHaveAttribute('data-status', 'loaded');
    rerender(<SmartImage image={makeImage(2)} preset="thumb" alt="Logo" />);
    expect(wrapper(container)).toHaveAttribute('data-status', 'loading');
  });

  it('cross-fades with a transition, and drops it for reduced motion', () => {
    const { container, unmount } = render(<SmartImage image={image} preset="thumb" alt="Logo" />);
    expect(screen.getByRole('img', { name: 'Logo' }).className).toContain('transition-opacity');
    expect(blur(container)?.className).toContain('transition-opacity');
    unmount();
    setPref('motion', 'reduced');
    render(<SmartImage image={image} preset="thumb" alt="Logo" />);
    expect(screen.getByRole('img', { name: 'Logo' }).className).not.toContain('transition-opacity');
  });

  it('still renders the image when the hash is unusable', () => {
    const { container } = render(<SmartImage image={makeImage(9, { thumbhash: '***' })} preset="thumb" alt="Logo" />);
    expect(blur(container)).toBeNull();
    expect(screen.getByRole('img', { name: 'Logo' })).toBeInTheDocument();
  });
});
