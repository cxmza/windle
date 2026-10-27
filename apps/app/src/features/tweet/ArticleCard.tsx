import type { XArticle } from '@windle/shared';
import { safeHref } from '../predict/ui/linkify';
import { SafeImage } from './SafeImage';

const SHELL =
  'flex flex-col overflow-hidden rounded-lg border border-(--hairline) bg-surface transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)';

export function ArticleCard({
  article,
  eager = false,
  passive = false,
}: {
  article: XArticle;
  eager?: boolean;
  passive?: boolean;
}) {
  const href = safeHref(article.url);
  const body = (
    <>
      {article.coverUrl ? (
        <span
          data-article-cover
          className="relative block aspect-[2/1] w-full overflow-hidden border-b border-(--hairline) bg-muted"
        >
          <SafeImage src={article.coverUrl} alt="" eager={eager} />
        </span>
      ) : null}
      <span className="flex flex-col gap-0.5 p-2.5">
        <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">Article</span>
        <span className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">{article.title}</span>
        {article.previewText ? (
          <span className="line-clamp-3 text-xs leading-snug text-muted-foreground">{article.previewText}</span>
        ) : null}
      </span>
    </>
  );
  return href && !passive ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-article
      aria-label={`Article: ${article.title}`}
      className={SHELL}
    >
      {body}
    </a>
  ) : (
    <div data-article className={SHELL}>
      {body}
    </div>
  );
}
