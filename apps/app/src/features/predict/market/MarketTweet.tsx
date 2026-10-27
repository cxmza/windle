import type { TweetSnapshot } from '@windle/shared';
import { Time } from '@/components/Time';
import { TweetView } from '../../tweet/TweetView';
import { toXPost } from '../../tweet/to-x-post';
import { useXPost } from '../../tweet/use-x-post';
import { isSampleTweetId } from '../tweets';
import { card } from '../ui/styles';

/**
 * The tweet the market is about. It shows at once from the copy saved at creation, and becomes the full post from X
 * (counts, link preview, poll, verification) when that arrives; if X cannot answer, the saved copy stays and says so.
 */
export function MarketTweet({ source, className = '' }: { source: TweetSnapshot; className?: string }) {
  const sample = isSampleTweetId(source.id);
  const query = useXPost(source.id, { enrich: true, enabled: !sample });
  const data = query.data;
  const live = data?.status === 'ok' ? data : null;

  const reason =
    data?.status === 'not_found'
      ? 'No longer on X'
      : data && data.status !== 'ok'
        ? 'Could not reach X'
        : live?.degraded
          ? 'Not confirmed on X'
          : null;

  return (
    <section aria-label="The team's tweet" className={`${card} ${className}`}>
      <TweetView
        post={live ? live.post : toXPost(source)}
        flush
        eager
        pending={query.isPending && !sample}
        footnote={
          live && !live.degraded ? undefined : (
            <>
              {reason ? `${reason} · ` : ''}Snapshot captured <Time iso={source.capturedAt} format="ago" /> — the
              original may be edited or deleted.
            </>
          )
        }
      />
    </section>
  );
}
