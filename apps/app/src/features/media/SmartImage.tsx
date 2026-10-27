import type { ApiImage, ImagePreset } from '@windle/shared';
import { type CSSProperties, useState } from 'react';
import { useReducedMotion } from '@/lib/media';
import { ImageIcon } from './icons';
import { placeholderUrl } from './placeholder';

type Props = {
  image: ApiImage;
  preset: ImagePreset;
  alt: string;
  /** The `sizes` hint for the card/cover pair; the avatar pair is described in device pixels instead. */
  sizes?: string;
  /** Above the fold: fetched at once and at high priority, instead of lazily. */
  priority?: boolean;
  /** Sizing and shape come from the caller (`size-8 rounded-full`, `w-full rounded-lg`). */
  className?: string;
};

type Load = { url: string; status: 'loaded' | 'error' };

const SQUARE_PX: Partial<Record<ImagePreset, number>> = { avatar64: 64, avatar128: 128, thumb: 160 };
const FIT_PX: Partial<Record<ImagePreset, number>> = { card: 480, cover: 1200 };

/** Width and height as the CDN renders `preset`: squares are cropped, card and cover keep the master's aspect. */
export function presetSize(image: ApiImage, preset: ImagePreset): { width: number; height: number } {
  const square = SQUARE_PX[preset];
  if (square) return { width: square, height: square };
  if (preset === 'og') return { width: 1200, height: 630 };
  const max = FIT_PX[preset] ?? 480;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  return { width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) };
}

/** Two renditions of the same picture where the CDN has two that fit, so the browser can pick for its screen. */
function sources(image: ApiImage, preset: ImagePreset, sizes: string | undefined) {
  const { urls } = image;
  if (preset === 'avatar64') return { src: urls.avatar64, srcSet: `${urls.avatar64} 1x, ${urls.avatar128} 2x` };
  if (preset === 'card' || preset === 'cover') {
    const card = presetSize(image, 'card').width;
    const cover = presetSize(image, 'cover').width;
    return {
      src: urls[preset],
      srcSet: `${urls.card} ${card}w, ${urls.cover} ${cover}w`,
      sizes: sizes ?? '100vw',
    };
  }
  return { src: urls[preset] };
}

/**
 * An uploaded picture that never waits on an empty box: the ThumbHash blur is there on the first frame, the real
 * file cross-fades over it when it has loaded, and a failed load keeps the blur with a quiet icon.
 */
export function SmartImage({ image, preset, alt, sizes, priority = false, className = '' }: Props) {
  const reduced = useReducedMotion();
  const { width, height } = presetSize(image, preset);
  const { src, srcSet, sizes: srcSizes } = sources(image, preset, sizes);
  const [load, setLoad] = useState<Load | null>(null);
  const status = load?.url === src ? load.status : 'loading';
  const blur = placeholderUrl(image.id, image.thumbhash);
  const fade = reduced ? '' : 'transition-opacity duration-(--dur-base) ease-(--ease-standard)';

  return (
    <span
      data-smart-image
      data-status={status}
      style={{ aspectRatio: `${width} / ${height}` } satisfies CSSProperties}
      className={`relative inline-block overflow-hidden bg-muted align-middle ${className}`}
    >
      {blur ? (
        <img
          src={blur}
          alt=""
          aria-hidden="true"
          data-placeholder
          draggable={false}
          className={`absolute inset-0 size-full object-cover ${fade} ${status === 'loaded' ? 'opacity-0' : 'opacity-100'}`}
        />
      ) : null}
      <img
        ref={(el) => {
          // A cached image can finish before React attaches onLoad.
          if (el?.complete && el.naturalWidth > 0)
            setLoad((l) => (l?.url === src ? l : { url: src, status: 'loaded' }));
        }}
        src={src}
        srcSet={srcSet}
        sizes={srcSizes}
        width={width}
        height={height}
        alt={alt}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        draggable={false}
        onLoad={() => setLoad({ url: src, status: 'loaded' })}
        onError={() => setLoad({ url: src, status: 'error' })}
        className={`absolute inset-0 size-full object-cover ${fade} ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status === 'error' ? (
        <span
          data-image-error
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-muted-foreground/70"
        >
          <ImageIcon size={16} />
        </span>
      ) : null}
    </span>
  );
}
