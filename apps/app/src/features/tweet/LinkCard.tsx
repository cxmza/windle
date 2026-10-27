import type { XCard } from '@windle/shared';
import { safeHref } from '../predict/ui/linkify';
import { SafeImage } from './SafeImage';

const SHELL =
  'flex min-w-0 overflow-hidden rounded-lg border border-(--hairline) bg-surface text-left transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)';

function Text({ card, lines }: { card: XCard; lines: 2 | 3 }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5">
      <span className="truncate font-mono text-xs text-muted-foreground">{card.domain}</span>
      <span className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">{card.title}</span>
      {card.description ? (
        <span className={`text-xs leading-snug text-muted-foreground ${lines === 3 ? 'line-clamp-3' : 'line-clamp-2'}`}>
          {card.description}
        </span>
      ) : null}
    </span>
  );
}

function PlayBadge() {
  return (
    <span
      data-card-play
      aria-hidden="true"
      className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-background/85 text-foreground"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M4 2.5v11l9-5.5z" />
      </svg>
    </span>
  );
}

/**
 * The preview of a link in the post. Every kind reserves its image box by aspect ratio before the image loads, and the
 * whole card is one link to the real address.
 */
export function LinkCard({
  card,
  eager = false,
  passive = false,
}: {
  card: XCard;
  eager?: boolean;
  passive?: boolean;
}) {
  const href = safeHref(card.url);
  const large = card.kind === 'summary_large_image' || card.kind === 'player';
  const label = `${card.title} (${card.domain})`;

  const body =
    large && card.imageUrl ? (
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          data-card-image
          className="relative block aspect-[1.91/1] w-full overflow-hidden border-b border-(--hairline) bg-muted"
        >
          <SafeImage src={card.imageUrl} alt="" eager={eager} />
          {card.kind === 'player' ? <PlayBadge /> : null}
        </span>
        <Text card={card} lines={2} />
      </span>
    ) : (
      <>
        {card.imageUrl ? (
          <span
            data-card-image
            className="relative block size-24 shrink-0 self-stretch overflow-hidden border-r border-(--hairline) bg-muted max-sm:size-20"
          >
            <SafeImage src={card.imageUrl} alt="" eager={eager} width={96} height={96} />
            {card.kind === 'player' ? <PlayBadge /> : null}
          </span>
        ) : null}
        <Text card={card} lines={3} />
      </>
    );

  if (!href || passive) return <div className={SHELL}>{body}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-link-card={card.kind}
      aria-label={label}
      className={SHELL}
    >
      {body}
    </a>
  );
}
