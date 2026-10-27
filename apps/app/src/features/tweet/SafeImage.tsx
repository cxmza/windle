import { useState } from 'react';
import { FeedImage } from '../feed/FeedImage';
import { safeHref } from '../predict/ui/linkify';

type Props = {
  src: string | null | undefined;
  alt: string;
  eager?: boolean;
  fit?: 'cover' | 'contain';
  /** Pixel size the browser may assume before the image is known. */
  width?: number;
  height?: number;
  className?: string;
};

/**
 * Fills the box its parent reserved. A missing, blocked or broken image leaves the box in place with a neutral mark,
 * so nothing around it moves. The image is fetched without a referrer.
 */
export function SafeImage({
  src,
  alt,
  eager = false,
  fit = 'cover',
  width = 640,
  height = 360,
  className = '',
}: Props) {
  const [broken, setBroken] = useState(false);
  const url = src ? safeHref(src) : null;
  if (!url || broken) {
    return (
      <span
        data-image-fallback
        role="img"
        aria-label={alt || 'Image unavailable'}
        className={`absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="m4 17 5-4.5 3.5 3 3-2.5L20 17" />
        </svg>
      </span>
    );
  }
  return (
    <FeedImage
      src={url}
      alt={alt}
      width={width}
      height={height}
      eager={eager}
      onError={() => setBroken(true)}
      className={`absolute inset-0 size-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
    />
  );
}
