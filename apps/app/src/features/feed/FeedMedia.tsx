import { useState } from 'react';
import { useMediaQuery } from '@/lib/media';
import { formatDuration } from '@/lib/time';
import { safeHref } from '../predict/ui/linkify';
import { pickVariant } from '../tweet/pick-variant';
import { FeedImage } from './FeedImage';
import type { FeedMediaItem } from './types';

/** The box exists from the first paint at a fixed 16:9, so a loading, failed or missing image never moves a row. */
export const MEDIA_BOX =
  'relative aspect-video w-full max-w-60 overflow-hidden rounded-lg border border-(--hairline) bg-muted';

/**
 * A video's own url is the media file, so it never goes into an <img>: the poster does, and without one the box stays
 * a plain placeholder with the play badge.
 */
export function FeedMedia({ media, extra, eager = false }: { media: FeedMediaItem; extra: number; eager?: boolean }) {
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const small = useMediaQuery('(max-width: 639px)');
  const video = media.kind === 'video';
  const file = video ? pickVariant(media, small) : null;
  const label = media.gif ? 'GIF' : media.durationMs ? formatDuration(media.durationMs) : 'Video';
  const src = video ? (media.poster ? safeHref(media.poster) : null) : safeHref(media.url);

  return (
    <div
      data-feed-media
      data-media-kind={media.kind}
      data-media-placeholder={src ? undefined : ''}
      className={`pointer-events-none mt-0.5 ${MEDIA_BOX}`}
    >
      {src && !broken ? (
        <FeedImage
          src={src}
          alt={media.alt ?? (video ? 'Video preview' : 'Image attached to the post')}
          width={240}
          height={135}
          eager={eager}
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {file && playing ? (
        <video
          src={file}
          autoPlay
          muted
          playsInline
          controls={!media.gif}
          loop={media.gif === true}
          aria-label={media.alt ?? (media.gif ? 'Animated GIF' : 'Video')}
          className="pointer-events-auto absolute inset-0 z-10 size-full bg-background object-contain"
        />
      ) : null}
      {video && !playing ? (
        <span
          data-media-play
          aria-hidden="true"
          className="absolute bottom-1.5 left-1.5 inline-flex h-5 items-center gap-1 rounded-sm bg-background/80 px-1.5 font-mono text-xs font-medium text-foreground tabular-nums"
        >
          {media.gif ? null : (
            <svg viewBox="0 0 16 16" width="9" height="9" fill="currentColor" aria-hidden="true">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
          {label}
        </span>
      ) : null}
      {file && !playing ? (
        <button
          type="button"
          data-media-start
          aria-label={media.gif ? 'Play GIF' : 'Play video'}
          onClick={() => setPlaying(true)}
          className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center outline-offset-[-2px] transition-colors duration-(--dur-instant) active:bg-background/20 [@media(hover:hover)]:hover:bg-background/10"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-background/85 text-foreground">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          </span>
        </button>
      ) : null}
      {extra > 0 ? (
        <span className="absolute right-1.5 bottom-1.5 inline-flex h-5 items-center rounded-sm bg-background/80 px-1.5 font-mono text-xs text-foreground tabular-nums">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
