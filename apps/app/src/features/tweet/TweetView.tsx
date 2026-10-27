import { tweetUrl, type XAuthor, type XPost } from '@windle/shared';
import type { ReactNode } from 'react';
import { Time } from '@/components/Time';
import { FeedAvatar } from '../feed/FeedAvatar';
import { safeHref } from '../predict/ui/linkify';
import { ArticleCard } from './ArticleCard';
import { CommunityNote } from './CommunityNote';
import { LinkCard } from './LinkCard';
import { MediaGrid } from './MediaGrid';
import { Metrics } from './Metrics';
import { Poll } from './Poll';
import { QuotedTweet } from './QuotedTweet';
import { RichText } from './RichText';
import { VerifiedBadge } from './VerifiedBadge';

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const TWITTER_EPOCH_MS = 1_288_834_974_657n;
const CHIP =
  'inline-flex h-4 shrink-0 items-center rounded-sm border border-(--hairline) px-1 text-xs leading-none font-medium tracking-[0.04em] text-muted-foreground uppercase';
const TEXT_LINK =
  'text-accent-text underline-offset-2 transition-colors duration-(--dur-instant) active:opacity-80 [@media(hover:hover)]:hover:underline';

const profileUrl = (handle: string): string | null => (HANDLE.test(handle) ? `https://x.com/${handle}` : null);

function snowflakeTime(id: string | null): string | null {
  if (!id || !/^\d{5,25}$/.test(id)) return null;
  const ms = (BigInt(id) >> 22n) + TWITTER_EPOCH_MS;
  return ms > TWITTER_EPOCH_MS ? new Date(Number(ms)).toISOString() : null;
}

function Affiliate({ affiliate }: { affiliate: NonNullable<XAuthor['affiliate']> }) {
  const href = affiliate.handle ? profileUrl(affiliate.handle) : null;
  const label = `Affiliated with ${affiliate.name}`;
  const badge = (
    <span
      title={label}
      className="relative inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-(--hairline) bg-muted text-xs font-semibold text-foreground"
    >
      {affiliate.badgeUrl && safeHref(affiliate.badgeUrl) ? (
        <img
          src={safeHref(affiliate.badgeUrl) ?? undefined}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{affiliate.name.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-affiliate
      aria-label={label}
      className="inline-flex rounded-md transition-opacity duration-(--dur-instant) active:opacity-70 [@media(hover:hover)]:hover:opacity-80"
    >
      {badge}
    </a>
  ) : (
    <span data-affiliate role="img" aria-label={label} className="inline-flex">
      {badge}
    </span>
  );
}

type Shown = {
  id: string;
  url: string;
  author: Pick<XAuthor, 'handle' | 'name' | 'avatarUrl' | 'verified'> & Partial<XAuthor>;
  text: string;
  media: XPost['media'];
  createdAt: string;
};

/** A repost has no content of its own: what is shown is the original, under a "reposted" line. */
function shownOf(post: XPost): { shown: Shown; repostedBy: XPost['author'] | null } {
  const q = post.quoted;
  if (post.kind !== 'repost' || !q) {
    return {
      shown: {
        id: post.id,
        url: post.url,
        author: post.author,
        text: post.text,
        media: post.media,
        createdAt: post.createdAt,
      },
      repostedBy: null,
    };
  }
  return {
    shown: {
      id: q.id ?? post.id,
      url: q.id && HANDLE.test(q.author.handle) ? tweetUrl(q.author.handle, q.id) : post.url,
      author: q.author,
      text: q.text,
      media: q.media,
      createdAt: q.createdAt ?? snowflakeTime(q.id) ?? post.createdAt,
    },
    repostedBy: post.author,
  };
}

const SHELL = 'flex min-w-0 flex-col gap-2.5 text-foreground';
const CARD = 'rounded-lg border border-(--hairline) bg-surface p-3.5 sm:p-4';

type Props = {
  post: XPost;
  /** The first media may load before it scrolls into view. */
  eager?: boolean;
  /** No border or padding of its own, for use inside a row. */
  flush?: boolean;
  /** Shown at the right of the footer, after "View on X". */
  footnote?: ReactNode;
  /** "Fetched from X · 12s ago" in the footer of an enriched post; off where the page says it already. */
  showFetched?: boolean;
  /** Leaves out the repost line, the header, "Replying to" and the text, for a place that already shows them (a feed row). */
  extrasOnly?: boolean;
  /** The full post is still on its way: room is kept for the counts when the stored copy has none. */
  pending?: boolean;
  className?: string;
};

/**
 * One post with what X shows for it: who wrote it (verification, affiliation, labels), the text with real links, the
 * media laid out as on X, a quoted post, a link preview, a poll, an article, a community note and the counts. Whatever
 * the post does not carry is left out, so a post from the live feed (text and media only) renders as that and no more.
 */
export function TweetView({
  post,
  eager = false,
  flush = false,
  footnote,
  showFetched = true,
  extrasOnly = false,
  pending = false,
  className = '',
}: Props) {
  const { shown, repostedBy } = shownOf(post);
  const { author } = shown;
  const attachment = shown.media.length > 0 || (post.quoted !== null && post.kind !== 'repost');
  const profile = profileUrl(author.handle);
  const href = safeHref(shown.url);
  const thread = post.thread ? tweetUrl(post.author.handle, post.conversationId ?? post.id) : null;

  return (
    <article
      data-tweet-view
      data-flush={flush || undefined}
      aria-label={`Tweet by @${author.handle}`}
      className={`${SHELL} ${flush ? '' : CARD} ${className}`}
    >
      {repostedBy && !extrasOnly ? (
        <p data-repost className="truncate text-xs text-muted-foreground">
          <span aria-hidden="true">↻ </span>
          <span className="font-mono">@{repostedBy.handle}</span> reposted
        </p>
      ) : null}

      {extrasOnly ? null : (
        <header className="flex items-start gap-2.5">
          <FeedAvatar name={author.name} src={author.avatarUrl ?? undefined} size="md" eager={eager} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm leading-5">
              {profile ? (
                <a
                  href={profile}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate font-semibold text-foreground underline-offset-2 [@media(hover:hover)]:hover:underline"
                >
                  {author.name}
                </a>
              ) : (
                <span className="min-w-0 truncate font-semibold">{author.name}</span>
              )}
              <VerifiedBadge kind={author.verified} size={16} />
              {author.affiliate ? <Affiliate affiliate={author.affiliate} /> : null}
              {author.automated ? <span className={CHIP}>Automated</span> : null}
              {author.parody ? <span className={CHIP}>Parody</span> : null}
            </p>
            <p className="flex min-w-0 items-center gap-1.5 font-mono text-xs leading-4 text-muted-foreground">
              <span className="truncate">@{author.handle}</span>
              <span aria-hidden="true">·</span>
              <Time iso={shown.createdAt} align="inline" />
              {post.edited ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span data-edited className="font-sans">
                    Edited
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </header>
      )}

      {post.inReplyTo && !extrasOnly ? (
        <p data-reply className="truncate text-xs text-muted-foreground">
          Replying to <span className="font-mono">@{post.inReplyTo.handle}</span>
        </p>
      ) : null}

      {extrasOnly ? null : <RichText text={shown.text} urls={post.urls} lang={post.lang} hasAttachment={attachment} />}

      {shown.media.length > 0 ? (
        <MediaGrid media={shown.media} postUrl={shown.url} sensitive={post.possiblySensitive === true} eager={eager} />
      ) : null}
      {post.poll ? <Poll poll={post.poll} /> : null}
      {post.article ? <ArticleCard article={post.article} eager={eager} /> : null}
      {post.card ? <LinkCard card={post.card} eager={eager} /> : null}
      {post.quoted && post.kind !== 'repost' ? <QuotedTweet quoted={post.quoted} eager={eager} /> : null}
      {post.communityNote ? <CommunityNote note={post.communityNote} /> : null}
      {post.metrics ? <Metrics metrics={post.metrics} /> : pending ? <MetricsPlaceholder /> : null}

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-(--hairline) pt-2 text-xs text-muted-foreground">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={`${TEXT_LINK} font-medium`}>
            View on X<span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
        {thread ? (
          <a data-thread href={thread} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
            Show this thread<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
        {post.enrichedAt && showFetched ? (
          <span data-fetched className="ml-auto">
            Fetched from X · <Time iso={post.enrichedAt} format="ago" />
          </span>
        ) : null}
        {footnote ? <span className={post.enrichedAt && showFetched ? '' : 'ml-auto'}>{footnote}</span> : null}
      </footer>
    </article>
  );
}

function MetricsPlaceholder() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Fetching the counts"
      data-metrics-placeholder
      className="h-[1.125rem] w-2/3 rounded-sm bg-muted motion-safe:animate-pulse"
    />
  );
}

/** The card's own frame with grey blocks where the content goes: about the height of a post with one image. */
export function TweetSkeleton({
  flush = false,
  extrasOnly = false,
  label = 'Fetching the tweet',
}: {
  flush?: boolean;
  extrasOnly?: boolean;
  label?: string;
}) {
  const block = 'rounded-sm bg-muted motion-safe:animate-pulse';
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-tweet-skeleton
      className={`${SHELL} ${flush ? '' : CARD}`}
    >
      {extrasOnly ? null : (
        <>
          <div className="flex items-center gap-2.5">
            <div className={`size-10 shrink-0 rounded-full ${block}`} />
            <div className="flex flex-col gap-1.5">
              <div className={`h-3.5 w-32 ${block}`} />
              <div className={`h-3 w-24 ${block}`} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className={`h-3.5 w-full ${block}`} />
            <div className={`h-3.5 w-11/12 ${block}`} />
            <div className={`h-3.5 w-2/3 ${block}`} />
          </div>
        </>
      )}
      <div className={`aspect-video w-full ${block}`} />
      <div className="h-8 border-t border-(--hairline)" />
    </div>
  );
}
