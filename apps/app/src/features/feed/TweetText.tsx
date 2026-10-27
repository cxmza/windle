import { safeHref, tokenizeTweet } from '../predict/ui/linkify';

const link =
  'relative text-accent-text underline decoration-transparent underline-offset-2 transition-colors duration-(--dur-instant) [@media(hover:hover)]:hover:decoration-current';

/** Plain text and anchors only: every link comes from the shared tokenizer and is http(s). */
export function TweetText({ text, id }: { text: string; id?: string }) {
  return (
    <p id={id} className="text-[0.8125rem] leading-[1.125rem] break-words text-foreground">
      {tokenizeTweet(text).map((t) =>
        t.kind === 'text' ? (
          <span key={t.at}>{t.text}</span>
        ) : (
          <a
            key={t.at}
            href={safeHref(t.href) ?? undefined}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={link}
          >
            {t.text}
          </a>
        ),
      )}
    </p>
  );
}
