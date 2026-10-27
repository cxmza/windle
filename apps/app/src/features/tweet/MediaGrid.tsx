import type { XMedia } from '@windle/shared';
import { Popover } from 'radix-ui';
import { type CSSProperties, useState } from 'react';
import { MediaPlayer } from './MediaPlayer';
import { SafeImage } from './SafeImage';

const MIN_RATIO = 0.8;
const MAX_RATIO = 2.4;
const FALLBACK_RATIO = 16 / 9;

type Props = {
  media: readonly XMedia[];
  postUrl: string;
  sensitive?: boolean;
  eager?: boolean;
  /** No links, buttons or players inside: for media drawn within another link (a quoted post). */
  passive?: boolean;
};

function AltBadge({ text }: { text: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Show image description"
        className="absolute bottom-1.5 left-1.5 z-10 inline-flex h-5 items-center rounded-sm bg-background/80 px-1.5 text-xs font-semibold tracking-[0.06em] text-foreground transition-colors duration-(--dur-instant) active:bg-background [@media(hover:hover)]:hover:bg-background"
      >
        ALT
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-alt-popover
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-60 w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-(--hairline) bg-surface-raised p-3 text-sm leading-snug whitespace-pre-wrap text-foreground"
        >
          <p className="mb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            Image description
          </p>
          {text}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Cell({
  item,
  postUrl,
  eager,
  contain,
  passive,
}: {
  item: XMedia;
  postUrl: string;
  eager: boolean;
  contain: boolean;
  passive: boolean;
}) {
  const alt = item.altText?.trim() ?? '';
  if (passive) {
    return (
      <div data-media-cell data-media-type={item.type} className="relative size-full overflow-hidden bg-muted">
        <SafeImage
          src={item.type === 'image' ? item.url : item.posterUrl}
          alt={alt || (item.type === 'image' ? 'Image attached to the quoted post' : 'Video preview')}
          eager={eager}
        />
        {item.type === 'image' ? null : (
          <span
            aria-hidden="true"
            className="absolute bottom-1.5 left-1.5 inline-flex h-5 items-center rounded-sm bg-background/80 px-1.5 text-xs font-medium text-foreground"
          >
            {item.type === 'gif' ? 'GIF' : 'Video'}
          </span>
        )}
      </div>
    );
  }
  return (
    <div data-media-cell data-media-type={item.type} className="relative size-full overflow-hidden bg-muted">
      {item.type === 'image' ? (
        <>
          <SafeImage
            src={item.url}
            alt={alt || 'Image attached to the post'}
            fit={contain ? 'contain' : 'cover'}
            eager={eager}
          />
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 outline-offset-[-2px] transition-colors duration-(--dur-instant) active:bg-background/10 [@media(hover:hover)]:hover:bg-background/5"
          >
            <span className="sr-only">Open the image in a new tab</span>
          </a>
          {alt ? <AltBadge text={alt} /> : null}
        </>
      ) : (
        <MediaPlayer media={item} postUrl={postUrl} eager={eager} />
      )}
    </div>
  );
}

function ratioOf(item: XMedia): { value: number; known: boolean } {
  if (!item.width || !item.height) return { value: FALLBACK_RATIO, known: false };
  return { value: Math.min(MAX_RATIO, Math.max(MIN_RATIO, item.width / item.height)), known: true };
}

const LAYOUT: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 grid-rows-2',
  4: 'grid-cols-2 grid-rows-2',
};

/**
 * One to four media laid out as X does: a single item at its own proportions (capped), two side by side, three as one
 * tall and two stacked, four as a grid. The box is sized before anything loads, so a slow or failed file moves nothing.
 * Media flagged sensitive stays blurred until the viewer asks.
 */
export function MediaGrid({ media, postUrl, sensitive = false, eager = false, passive = false }: Props) {
  const [revealed, setRevealed] = useState(false);
  const items = media.slice(0, 4);
  if (items.length === 0) return null;
  const hidden = sensitive && !passive && !revealed;
  const first = items[0];
  if (!first) return null;

  const single = items.length === 1;
  const ratio = ratioOf(first);
  const style: CSSProperties = { aspectRatio: single ? String(ratio.value) : '16 / 9' };

  return (
    <div
      data-media-grid
      data-count={items.length}
      data-ratio={single ? ratio.value : 16 / 9}
      data-sensitive={hidden || undefined}
      style={style}
      className="relative w-full overflow-hidden rounded-lg border border-(--hairline) bg-muted"
    >
      <div
        data-media-body
        className={`grid size-full gap-0.5 ${single ? '' : (LAYOUT[items.length] ?? 'grid-cols-2')} ${
          hidden ? 'pointer-events-none blur-2xl select-none' : ''
        }`}
        aria-hidden={hidden || undefined}
        inert={hidden || undefined}
      >
        {items.map((item, i) => (
          <div
            key={item.url}
            className={items.length === 3 && i === 0 ? 'row-span-2 min-h-0 min-w-0' : 'min-h-0 min-w-0'}
          >
            <Cell
              item={item}
              postUrl={postUrl}
              eager={eager && i === 0}
              contain={single && !ratio.known && item.type === 'image'}
              passive={passive}
            />
          </div>
        ))}
      </div>
      {hidden ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 p-3 text-center">
          <p className="text-sm font-medium text-foreground">Sensitive content</p>
          <p className="text-xs text-muted-foreground">The author marked this media as possibly sensitive.</p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="inline-flex h-8 items-center rounded-md border border-(--control-border) bg-surface px-3 text-sm font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)"
          >
            Show
          </button>
        </div>
      ) : null}
    </div>
  );
}
