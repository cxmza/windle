import type { ApiMarket } from '@windle/shared';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { buttonClass } from '@/components/Button';
import { TweetSkeleton } from '../../tweet/TweetView';
import { Field, inputClass } from '../ui/Field';
import { type Draft, parseUrl } from './draft';
import { TweetPreview } from './TweetPreview';

export type LookupFailure = { code: string; message: string };
export type Lookup = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: LookupFailure };

type Props = {
  draft: Draft;
  lookup: Lookup;
  existing: ApiMarket | undefined;
  showError: boolean;
  onUrl: (value: string) => void;
  onRetry: () => void;
};

const PREVIEW_MIN = 'min-h-40';

function Placeholder() {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-(--hairline) p-4 text-center text-sm text-muted-foreground ${PREVIEW_MIN}`}
    >
      The tweet appears here.
    </div>
  );
}

function Notice({ tone, title, children }: { tone: 'warn' | 'info'; title: string; children?: ReactNode }) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={`flex flex-col gap-1 rounded-xl border p-4 text-sm ${tone === 'warn' ? 'border-(--loss)/50' : 'border-(--hairline) bg-surface'}`}
    >
      <p className="font-medium text-foreground">{title}</p>
      {children ? <div className="text-muted-foreground">{children}</div> : null}
    </div>
  );
}

const link = 'font-medium text-accent-text underline underline-offset-2';

export function StepTweet({ draft, lookup, existing, showError, onUrl, onRetry }: Props) {
  const parsed = parseUrl(draft.url);
  const urlError =
    parsed && !parsed.ok ? parsed.message : showError && !parsed ? 'Paste the link to a tweet.' : undefined;
  const loaded = parsed?.ok && draft.tweet?.id === parsed.statusId ? draft.tweet : null;
  const duplicate = existing ?? undefined;
  const [waited, setWaited] = useState(false);
  if (lookup.status === 'loading' && !waited) setWaited(true);

  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Tweet link"
        hint="Copy the link of the tweet in which the team made its promise, from x.com or twitter.com."
        error={urlError}
      >
        {(control) => (
          <input
            {...control}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://x.com/team/status/1846811200000000011"
            value={draft.url}
            onChange={(e) => onUrl(e.target.value)}
            className={inputClass}
          />
        )}
      </Field>

      <div aria-live="polite" className={`flex flex-col gap-3 ${PREVIEW_MIN}`}>
        {lookup.status === 'idle' && !loaded ? <Placeholder /> : null}
        {lookup.status === 'loading' && parsed?.ok ? <TweetSkeleton /> : null}
        {lookup.status === 'error' && parsed?.ok ? (
          lookup.error.code === 'tweet_not_found' ? (
            <Notice tone="warn" title="We could not find that tweet.">
              <p>It may be deleted, or the account is private or protected. Check the link and try again.</p>
              <button type="button" onClick={onRetry} className={buttonClass('secondary', 'sm', 'mt-3 w-fit')}>
                Try again
              </button>
            </Notice>
          ) : lookup.error.code === 'x_rate_limited' ? (
            <Notice tone="warn" title="X is rate limiting lookups.">
              <p>Wait a moment, then try again.</p>
              <button type="button" onClick={onRetry} className={buttonClass('secondary', 'sm', 'mt-3 w-fit')}>
                Try again
              </button>
            </Notice>
          ) : (
            <Notice tone="warn" title="Could not load the tweet.">
              <p>{lookup.error.message}</p>
              <button type="button" onClick={onRetry} className={buttonClass('secondary', 'sm', 'mt-3 w-fit')}>
                Try again
              </button>
            </Notice>
          )
        ) : null}
        {loaded ? (
          <div key={loaded.id} data-tweet-reveal={waited || undefined}>
            <TweetPreview tweet={loaded} />
          </div>
        ) : null}
        {loaded && duplicate ? (
          <Notice tone="warn" title="A market already exists for this tweet.">
            <Link to={`/m/${duplicate.slug}`} className={link}>
              Open the existing market
            </Link>
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
