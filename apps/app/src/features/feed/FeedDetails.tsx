import { type TransitionEvent, useRef } from 'react';
import { TweetSkeleton, TweetView } from '../tweet/TweetView';
import { toXPost } from '../tweet/to-x-post';
import { useXPost } from '../tweet/use-x-post';
import type { XPostResult } from '../tweet/x-post-api';
import { type FeedTweet, sourceId } from './types';
import { useKeepScroll } from './use-keep-scroll';

const NOTE = {
  not_found: 'X no longer returns this post. It may be deleted or protected. Showing the feed copy.',
  rate_limited: 'X is rate limiting lookups. Showing the feed copy.',
  unavailable: 'Could not reach X. Showing the feed copy.',
  offline: 'Could not reach X. Showing the feed copy.',
  sample: 'Sample post: there is nothing on X to fetch.',
} as const;

/** How the panel appears: the row's height eases open, the content only fades in (Calm), or it is just there. */
export type DetailsReveal = 'expand' | 'fade' | 'instant';

type Props = {
  tweet: FeedTweet;
  id: string;
  open: boolean;
  reveal: DetailsReveal;
  /** The height finished easing shut (expand only): the panel can leave the DOM. */
  onCollapsed: () => void;
};

/**
 * What the post has beyond its row, under it (media, link card, poll, quote, counts); the row already shows who wrote it,
 * when, and the text. It is fetched from X only now, because somebody opened the row; until it arrives a
 * skeleton holds the place, and if X cannot answer the row's own copy is shown with a note.
 *
 * The outer box is the one that changes height (opening, closing, the post arriving), so it is the one scroll
 * compensation watches: an ease that starts above the visible top moves the scroller with it, frame by frame.
 */
export function FeedDetails({ tweet, id, open, reveal, onCollapsed }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useKeepScroll(ref, true);
  const live = tweet.feed !== undefined;
  const original = sourceId(tweet);
  const query = useXPost(original, { enrich: true, enabled: live });
  const data: XPostResult | { status: 'sample' } | undefined = !live
    ? { status: 'sample' }
    : original === null
      ? { status: 'unavailable' }
      : query.data;

  const onTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && !open) onCollapsed();
  };

  return (
    <div
      ref={ref}
      id={id}
      data-feed-details={reveal}
      data-open={open || undefined}
      inert={!open || undefined}
      onTransitionEnd={onTransitionEnd}
      className="-mt-1 grid min-w-0"
    >
      <div className="min-h-0 min-w-0">
        <div
          data-feed-details-panel
          className="relative mt-2 min-w-0 rounded-lg border border-(--hairline) bg-surface p-3"
        >
          {!data ? (
            <TweetSkeleton flush extrasOnly />
          ) : data.status === 'ok' ? (
            <TweetView
              post={data.post}
              flush
              eager
              extrasOnly
              footnote={data.degraded ? 'Not confirmed on X' : undefined}
            />
          ) : (
            <TweetView post={toXPost(tweet)} flush eager extrasOnly footnote={NOTE[data.status]} />
          )}
        </div>
      </div>
    </div>
  );
}
