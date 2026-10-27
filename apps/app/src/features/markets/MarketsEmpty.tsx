import { WindleMark } from '@windle/brand';
import { Link } from 'react-router';
import { buttonClass } from '@/components/Button';

/** First paint while the list loads: the same row height as a real list, so nothing jumps when it arrives. */
export function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-12 items-center gap-3 border-b border-(--hairline) px-4 md:px-6">
          <div className="size-8 shrink-0 rounded-md bg-muted/50 motion-safe:animate-pulse" />
          <div className="h-3.5 w-full max-w-md rounded-sm bg-muted/50 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** No open markets: how markets start, and the one step that starts the first one. */
export function MarketsEmpty({ onShowFeed }: { onShowFeed: (() => void) | undefined }) {
  return (
    <div
      data-markets-empty
      className="flex flex-col items-start gap-5 border-t border-(--hairline) px-4 py-10 md:px-6 md:py-14"
    >
      <WindleMark decorative size={32} className="text-muted-foreground" />
      <div className="flex max-w-prose flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-balance">No open markets yet</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Every market starts from a promise made on X. Pick a live post from the feed, say what counts as keeping it,
          set a deadline, and everyone can take a side with practice points. The first market is yours to open.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/create" className={buttonClass('primary', 'md')}>
          Create a market from a live post
        </Link>
        {onShowFeed ? (
          <button type="button" onClick={onShowFeed} className={buttonClass('secondary', 'md')}>
            Open the live feed
          </button>
        ) : null}
      </div>
    </div>
  );
}
