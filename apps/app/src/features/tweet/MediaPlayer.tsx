import type { XMedia } from '@windle/shared';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery, useReducedMotion } from '@/lib/media';
import { formatDuration } from '@/lib/time';
import { pickVariants } from './pick-variant';
import { SafeImage } from './SafeImage';

const BADGE =
  'pointer-events-none absolute left-1.5 inline-flex h-5 items-center gap-1 rounded-sm bg-background/80 px-1.5 font-mono text-xs font-medium text-foreground tabular-nums';
const BADGE_BOTTOM = `${BADGE} bottom-1.5`;
const BADGE_TOP = `${BADGE} top-1.5`;

function PlayGlyph({ size = 10 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  );
}

type Props = { media: XMedia; eager?: boolean; postUrl: string };

function Unplayable({ media, eager, postUrl }: Props) {
  const poster = media.posterUrl ?? null;
  return (
    <a
      href={postUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-media-unplayable
      className="absolute inset-0 flex items-center justify-center bg-muted outline-offset-[-2px] transition-colors duration-(--dur-instant) active:opacity-80 [@media(hover:hover)]:hover:bg-(--hover)"
    >
      {poster ? <SafeImage src={poster} alt={media.altText ?? 'Video preview'} eager={eager ?? false} /> : null}
      <span className="relative inline-flex h-7 items-center gap-1.5 rounded-md bg-background/85 px-2 text-xs font-medium text-foreground">
        <PlayGlyph />
        Watch on X<span className="sr-only"> (opens in a new tab)</span>
      </span>
    </a>
  );
}

/**
 * A video plays inline: the best mp4, native controls, nothing downloaded until the person presses play, silent until
 * they unmute. A gif loops silently on its own, and waits for a press when reduced motion is on. The still frame is the
 * element's own poster, so nothing paints over it. A file that fails to load is replaced by the next mp4 variant; when
 * none is left the player turns into a link to the post.
 */
export function MediaPlayer({ media, eager = false, postUrl }: Props) {
  const small = useMediaQuery('(max-width: 639px)');
  const reduced = useReducedMotion();
  const sources = pickVariants(media, small);
  const ref = useRef<HTMLVideoElement>(null);
  const wanted = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  const [manual, setManual] = useState(false);
  const gif = media.type === 'gif';
  const poster = media.posterUrl ?? undefined;
  const src = sources[attempt];

  // The element keeps its state across a new src; load it again, and carry on if somebody was already watching.
  useEffect(() => {
    const el = ref.current;
    if (attempt === 0 || !el) return;
    if (typeof el.load === 'function') el.load();
    if (wanted.current && typeof el.play === 'function') void Promise.resolve(el.play()).catch(() => {});
  }, [attempt]);

  if (!src) return <Unplayable media={media} eager={eager} postUrl={postUrl} />;

  const onError = () => setAttempt((n) => n + 1);

  if (gif) {
    const playing = !reduced || manual;
    const toggle = () => {
      const el = ref.current;
      const next = !manual;
      setManual(next);
      wanted.current = next;
      if (!el) return;
      if (next) void Promise.resolve(el.play()).catch(() => {});
      else el.pause();
    };
    return (
      <>
        <video
          ref={ref}
          src={src}
          poster={poster}
          aria-label={media.altText ?? 'Animated GIF'}
          muted
          loop
          playsInline
          autoPlay={playing}
          preload={playing ? 'auto' : 'none'}
          onError={onError}
          data-gif
          className="absolute inset-0 size-full object-cover"
        />
        <span className={BADGE_BOTTOM}>GIF</span>
        {reduced ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={manual ? 'Pause GIF' : 'Play GIF'}
            aria-pressed={manual}
            className="absolute inset-0 flex items-center justify-center outline-offset-[-2px] transition-colors duration-(--dur-instant) active:bg-background/20 [@media(hover:hover)]:hover:bg-background/10"
          >
            {manual ? null : (
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-background/85 text-foreground">
                <PlayGlyph size={12} />
              </span>
            )}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster}
        aria-label={media.altText ?? 'Video'}
        controls
        muted
        playsInline
        preload="none"
        onPlay={() => {
          wanted.current = true;
          setStarted(true);
        }}
        onPause={() => {
          if (!ref.current?.error) wanted.current = false;
        }}
        onError={onError}
        data-video
        className="absolute inset-0 size-full object-contain"
      />
      {!started && media.durationMs ? (
        <span data-duration className={BADGE_TOP}>
          <PlayGlyph size={9} />
          {formatDuration(media.durationMs)}
        </span>
      ) : null}
    </>
  );
}
