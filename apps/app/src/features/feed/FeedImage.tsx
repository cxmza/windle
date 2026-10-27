import { useState } from 'react';

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Rows near the top are on screen at once; their images must not wait for the lazy-loading threshold. */
  eager: boolean;
  onError: () => void;
  className: string;
};

/** The box around it is already sized, so the image only fades in (opacity) once decoded; nothing moves. */
export function FeedImage({ src, alt, width, height, eager, onError, className }: Props) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setLoaded(true);
      }}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={onError}
      data-loaded={loaded || undefined}
      className={`${className} opacity-0 transition-opacity duration-(--dur-fast) ease-(--ease-standard) data-[loaded]:opacity-100`}
    />
  );
}
