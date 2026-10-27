import type { TweetSnapshot, XVerified } from '@windle/shared';
import type { ReactNode } from 'react';
import { buttonClass } from '@/components/Button';
import { Time } from '@/components/Time';
import { TweetSkeleton, TweetView } from '../../tweet/TweetView';
import { toXPost } from '../../tweet/to-x-post';
import { useXPost } from '../../tweet/use-x-post';
import { VerifiedBadge } from '../../tweet/VerifiedBadge';
import { isSampleTweetId } from '../tweets';

const BADGE_NAME: Record<XVerified, string> = {
  none: 'No check mark',
  blue: 'Blue check',
  business: 'Gold check (business)',
  government: 'Grey check (government)',
};

function Note({ tone, title, children }: { tone: 'warn' | 'info'; title: string; children?: ReactNode }) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      data-preview-note={tone}
      className={`flex flex-col gap-1 rounded-lg border p-3 text-sm ${tone === 'warn' ? 'border-(--loss)/50' : 'border-(--hairline) bg-surface'}`}
    >
      <p className="font-medium text-foreground">{title}</p>
      {children ? <div className="text-muted-foreground">{children}</div> : null}
    </div>
  );
}

function VerifiedRow({
  handle,
  verified,
  fetchedAt,
}: {
  handle: string;
  verified: XVerified | undefined;
  fetchedAt: string;
}) {
  const kind = verified ?? 'none';
  return (
    <div
      data-verified-on-x
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-(--yes)/40 bg-yes-soft px-3 py-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-(--yes)">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Verified on X
      </span>
      <span className="inline-flex items-center gap-1.5 text-foreground">
        <span className="font-mono">@{handle}</span>
        <VerifiedBadge kind={kind} size={14} />
        <span className="text-muted-foreground">{BADGE_NAME[kind]}</span>
      </span>
      <span className="ml-auto text-muted-foreground">
        Fetched from X · <Time iso={fetchedAt} format="ago" />
      </span>
    </div>
  );
}

type Props = { tweet: TweetSnapshot };

/**
 * The tweet the wizard is about, as X has it. The post is fetched from X for this link (enriched); while that runs a
 * skeleton keeps the place, and when X cannot answer the saved copy is shown with the reason, never a blank.
 */
export function TweetPreview({ tweet }: Props) {
  const sample = isSampleTweetId(tweet.id);
  const query = useXPost(tweet.id, { enrich: true, enabled: !sample });
  const fallback = toXPost(tweet);

  if (sample) return <TweetView post={fallback} footnote="Sample tweet" />;
  const data = query.data;
  if (!data) return <TweetSkeleton />;

  if (data.status === 'ok') {
    const { post, enriched, degraded } = data;
    return (
      <div className="flex flex-col gap-2">
        {enriched && post.enrichedAt ? (
          <VerifiedRow handle={post.author.handle} verified={post.author.verified} fetchedAt={post.enrichedAt} />
        ) : null}
        {degraded ? (
          <Note tone="info" title="Showing the feed copy of this tweet.">
            X details (counts, link preview, verification) are unavailable right now; the text and media are what the
            feed saw.
          </Note>
        ) : null}
        <TweetView post={post} showFetched={false} />
      </div>
    );
  }

  const retry = (
    <button type="button" onClick={() => void query.refetch()} className={buttonClass('secondary', 'sm', 'mt-2 w-fit')}>
      Try again
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {data.status === 'not_found' ? (
        <Note tone="warn" title="X no longer returns this tweet.">
          It was deleted, or the account is protected. The copy below is what we saved; the market keeps it.
        </Note>
      ) : data.status === 'rate_limited' ? (
        <Note tone="info" title="X is rate limiting lookups.">
          Showing the saved copy. Try again in a moment to verify it on X.
          {retry}
        </Note>
      ) : (
        <Note tone="info" title="Could not verify this tweet on X right now.">
          Showing the saved copy.
          {retry}
        </Note>
      )}
      <TweetView post={fallback} />
    </div>
  );
}
