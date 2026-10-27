import type { Market } from '@windle/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { OddsNumber, OddsUnit } from '@/components/OddsNumber';
import { Time } from '@/components/Time';
import { usePref } from '@/features/settings/prefs';
import { useReducedMotion } from '@/lib/media';
import { probToPercent } from '../predict/format';
import { safeHref } from '../predict/ui/linkify';
import { statusText } from '../predict/ui/MarketStatusBadge';
import { VerifiedBadge } from '../tweet/VerifiedBadge';
import { tickerOf } from './build';
import { classifyTweet } from './classify';
import { FeedAvatar } from './FeedAvatar';
import { type DetailsReveal, FeedDetails } from './FeedDetails';
import { FeedMedia } from './FeedMedia';
import { TweetText } from './TweetText';
import { type FeedQuoted, type FeedTweet, sourceTweet } from './types';

const chip =
  'inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-xs font-medium tracking-[0.06em] uppercase';

const action =
  "relative inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) max-md:before:absolute max-md:before:-inset-y-2.5 max-md:before:inset-x-0 max-md:before:content-['']";

const CASHTAG = /\$[A-Za-z][A-Za-z0-9]{1,9}\b/;

/** At most two chips from the relay's crypto signals: a contract address, and the first cashtag the text shows. */
export function signalChips(signals: readonly string[] | undefined, text: string): string[] {
  if (!signals) return [];
  const chips: string[] = [];
  if (signals.includes('ca_sol') || signals.includes('ca_evm')) chips.push('CA');
  if (signals.includes('cashtag')) chips.push(text.match(CASHTAG)?.[0].toUpperCase() ?? '$');
  return chips;
}

export const createHref = (tweet: Pick<FeedTweet, 'url'>): string => `/create?tweet=${encodeURIComponent(tweet.url)}`;

function MarketAction({ market }: { market: Market }) {
  const open = market.status === 'open';
  const pct = probToPercent(market.probYes);
  return (
    <Link
      to={`/m/${market.slug}`}
      data-feed-market
      className={`${action} ${
        open
          ? 'border-transparent bg-yes-soft font-mono text-(--yes) [@media(hover:hover)]:hover:border-(--yes)'
          : 'border-(--hairline) font-medium text-muted-foreground [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground'
      }`}
    >
      {open ? (
        <>
          <span className="font-semibold">YES</span>
          <span className="tabular-nums">
            <OddsNumber value={pct} />
            <OddsUnit />
          </span>
        </>
      ) : (
        statusText(market)
      )}
      <span aria-hidden="true">→</span>
      <span className="sr-only">
        {open ? ' odds' : ''}, open the market: {market.statement}
      </span>
    </Link>
  );
}

const KIND_LABEL = { reply: 'Reply', quote: 'Quote' } as const;

function FeedQuote({ quoted }: { quoted: FeedQuoted }) {
  return (
    <blockquote
      data-feed-quote
      className="mt-0.5 flex min-w-0 flex-col gap-0.5 rounded-md border border-(--hairline) px-2 py-1.5"
    >
      <p className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
        <FeedAvatar name={quoted.name} src={quoted.avatarUrl} size="xs" />
        <span className="truncate font-semibold text-foreground">{quoted.name}</span>
        <span className="truncate font-mono text-muted-foreground">@{quoted.handle}</span>
      </p>
      <p className="line-clamp-3 text-xs leading-4 text-muted-foreground">{quoted.text}</p>
    </blockquote>
  );
}

export function FeedRow({
  tweet,
  market,
  eager = false,
}: {
  tweet: FeedTweet;
  market: Market | undefined;
  eager?: boolean;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();
  const calm = usePref('feedMotion') === 'calm';
  const reveal: DetailsReveal = reduced ? 'instant' : calm ? 'fade' : 'expand';
  const toggle = () => {
    if (!open) setShown(true);
    else if (reveal !== 'expand') setShown(false);
    setOpen(!open);
  };
  const kind = classifyTweet(tweet.text);
  const ticker = market?.project.ticker ?? tickerOf(tweet.author.handle);
  const href = safeHref(tweet.url);
  const media = tweet.media?.[0];
  const extra = tweet.feed;
  const deleted = extra?.deleted === true;
  const repost = extra?.repost ?? null;
  const source = sourceTweet(tweet);
  const badge = extra && (extra.kind === 'reply' || extra.kind === 'quote') ? KIND_LABEL[extra.kind] : null;
  const chips = signalChips(extra?.signals, tweet.text).filter((c) => c !== `$${ticker}`);
  const tag = extra?.tags.includes('founder') ? 'Founder' : extra?.tags.includes('kol') ? 'KOL' : null;

  return (
    <article
      aria-labelledby={repost ? `${uid}-repost ${uid}-who ${uid}-text` : `${uid}-who ${uid}-text`}
      data-feed-row
      data-kind={kind}
      data-tweet-id={tweet.id}
      data-deleted={deleted || undefined}
      className="group relative flex gap-2.5 border-b border-(--hairline) px-3 py-2.5 data-[deleted]:opacity-60 transition-colors duration-(--dur-instant) ease-(--ease-standard) has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-ring active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover) [[data-density=compact]_&]:py-1.5"
    >
      <FeedAvatar name={tweet.author.name} src={tweet.author.avatarUrl} eager={eager} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {repost ? (
          <p id={`${uid}-repost`} data-feed-repost className="truncate text-xs leading-4 text-muted-foreground">
            <span aria-hidden="true">↻ </span>
            <span className="font-mono">@{repost.by.handle}</span> reposted
          </p>
        ) : null}
        <header className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
          <h3 id={`${uid}-who`} className="flex min-w-0 items-center gap-1 font-semibold text-foreground">
            <span className="truncate">{tweet.author.name}</span>
            {tweet.author.verified ? <VerifiedBadge kind="blue" size={13} /> : null}
          </h3>
          <span className="truncate font-mono text-xs text-muted-foreground">@{tweet.author.handle}</span>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-row-link
              className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-mono text-xs text-muted-foreground outline-none after:absolute after:inset-0 after:content-['']"
            >
              <Time iso={tweet.createdAt} />
              <span
                aria-hidden="true"
                className="w-3 text-center opacity-0 transition-opacity duration-(--dur-instant) group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
              >
                ↗
              </span>
              <span className="sr-only"> (open the post on X in a new tab)</span>
            </a>
          ) : (
            <Time iso={tweet.createdAt} className="ml-auto font-mono text-xs text-muted-foreground" />
          )}
        </header>

        {extra?.replyTo ? (
          <p data-feed-reply className="truncate text-xs leading-4 text-muted-foreground">
            Replying to <span className="font-mono">@{extra.replyTo}</span>
          </p>
        ) : null}

        <div className="line-clamp-6">
          <TweetText text={tweet.text} id={`${uid}-text`} />
        </div>

        {extra?.quoted ? <FeedQuote quoted={extra.quoted} /> : null}

        {media ? (
          <FeedMedia
            key={media.poster ?? media.url}
            media={media}
            extra={(tweet.media?.length ?? 1) - 1}
            eager={eager}
          />
        ) : null}

        <footer className="mt-0.5 flex min-h-6 flex-wrap items-center gap-1.5">
          {ticker ? <span className="font-mono text-xs font-semibold text-accent-text">${ticker}</span> : null}
          {chips.map((c) => (
            <span key={c} data-feed-signal className={`${chip} border-(--hairline) font-mono text-muted-foreground`}>
              {c}
            </span>
          ))}
          {tag ? <span className={`${chip} border-(--hairline) text-muted-foreground`}>{tag}</span> : null}
          {badge ? <span className={`${chip} border-(--hairline) text-muted-foreground`}>{badge}</span> : null}
          {deleted ? <span className={`${chip} border-(--hairline) text-muted-foreground`}>Deleted</span> : null}
          {kind === 'promise' ? <span className={`${chip} border-border-accent text-accent-text`}>Promise</span> : null}
          <span className="ml-auto flex items-center gap-1.5">
            {deleted ? null : (
              <button
                type="button"
                data-feed-details-toggle
                aria-expanded={open}
                aria-controls={`${uid}-details`}
                onClick={toggle}
                className={`${action} border-transparent font-medium text-muted-foreground group-focus-within:border-(--hairline) [@media(hover:hover)]:hover:border-border-strong [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:group-hover:border-(--hairline)`}
              >
                Details
                <svg
                  viewBox="0 0 16 16"
                  width="10"
                  height="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={open ? 'rotate-180' : ''}
                >
                  <path d="m3.5 6 4.5 4.5L12.5 6" />
                </svg>
              </button>
            )}
            {market ? (
              <MarketAction market={market} />
            ) : deleted || !source ? null : (
              <Link
                to={createHref(source)}
                data-feed-create
                className={`${action} font-medium [@media(hover:hover)]:hover:border-border-strong [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground ${
                  kind === 'promise'
                    ? 'border-(--control-border) text-foreground'
                    : 'border-transparent text-muted-foreground group-focus-within:border-(--hairline) [@media(hover:hover)]:group-hover:border-(--hairline)'
                }`}
              >
                Create market
              </Link>
            )}
          </span>
        </footer>

        {shown ? (
          <FeedDetails
            tweet={tweet}
            id={`${uid}-details`}
            open={open}
            reveal={reveal}
            onCollapsed={() => setShown(false)}
          />
        ) : null}
      </div>
    </article>
  );
}
