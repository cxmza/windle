import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedMedia } from './FeedMedia';

afterEach(() => vi.unstubAllGlobals());

const VIDEO = {
  kind: 'video' as const,
  url: 'https://video.twimg.com/a.mp4',
  poster: 'https://pbs.twimg.com/p.jpg',
  durationMs: 42_000,
};

describe('FeedMedia inline playback', () => {
  it('shows the poster with the duration and starts nothing', () => {
    const { container } = render(<FeedMedia media={VIDEO} extra={0} />);
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('0:42')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', VIDEO.poster);
  });

  it('plays inside the same box when pressed, silently and with controls', () => {
    const { container } = render(<FeedMedia media={VIDEO} extra={0} />);
    const box = container.querySelector('[data-feed-media]');
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', VIDEO.url);
    expect(video).toHaveAttribute('controls');
    expect(video?.muted).toBe(true);
    expect(container.querySelector('[data-feed-media]')).toBe(box);
    expect(box).toHaveClass('aspect-video');
    expect(screen.queryByRole('button', { name: 'Play video' })).toBeNull();
  });

  it('plays a gif looped and without controls, labelled GIF', () => {
    const { container } = render(<FeedMedia media={{ ...VIDEO, gif: true, durationMs: 0 }} extra={0} />);
    expect(screen.getByText('GIF')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play GIF' }));
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('loop');
    expect(video).not.toHaveAttribute('controls');
  });

  it('offers no player for media with no playable file', () => {
    render(<FeedMedia media={{ kind: 'video', url: 'https://video.twimg.com/a.m3u8' }} extra={0} />);
    expect(screen.queryByRole('button', { name: 'Play video' })).toBeNull();
  });
});
