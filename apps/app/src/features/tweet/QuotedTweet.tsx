import { tweetUrl, type XQuoted } from '@windle/shared';
import { Time } from '@/components/Time';
import { FeedAvatar } from '../feed/FeedAvatar';
import { ArticleCard } from './ArticleCard';
import { LinkCard } from './LinkCard';
import { MediaGrid } from './MediaGrid';
import { Poll } from './Poll';
import { RichText } from './RichText';
import { tokenizeRich } from './rich-text';
import { VerifiedBadge } from './VerifiedBadge';

const SHELL =
  'flex min-w-0 flex-col gap-1.5 rounded-lg border border-(--hairline) p-2.5 text-left transition-colors duration-(--dur-instant) ease-(--ease-standard)';

/** The post being quoted, drawn smaller and as one link to it. Nothing inside it is a link of its own. */
export function QuotedTweet({ quoted, eager = false }: { quoted: XQuoted; eager?: boolean }) {
  const { author } = quoted;
  const href = quoted.id && /^[A-Za-z0-9_]{1,15}$/.test(author.handle) ? tweetUrl(author.handle, quoted.id) : null;
  const plain = tokenizeRich(quoted.text, quoted.urls, quoted.media.length > 0)
    .map((t) => t.text)
    .join('');
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
        <FeedAvatar name={author.name} src={author.avatarUrl ?? undefined} size="xs" />
        <span className="truncate font-semibold text-foreground">{author.name}</span>
        <VerifiedBadge kind={author.verified} size={13} />
        <span className="truncate font-mono text-muted-foreground">@{author.handle}</span>
        {quoted.createdAt ? (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <Time iso={quoted.createdAt} className="font-mono text-muted-foreground" />
          </>
        ) : null}
      </span>
      <RichText text={plain} plainLines={6} />
      {quoted.poll ? <Poll poll={quoted.poll} /> : null}
      {quoted.article ? <ArticleCard article={quoted.article} passive eager={eager} /> : null}
      {quoted.card ? <LinkCard card={quoted.card} passive eager={eager} /> : null}
      {quoted.media.length > 0 ? <MediaGrid media={quoted.media} postUrl={href ?? ''} passive eager={eager} /> : null}
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-quoted
      aria-label={`Quoted post by @${author.handle}`}
      className={`${SHELL} active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)`}
    >
      {body}
    </a>
  ) : (
    <div data-quoted className={SHELL}>
      {body}
    </div>
  );
}
