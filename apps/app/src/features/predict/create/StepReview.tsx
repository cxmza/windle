import { durationPresetOf, SIDE_LABELS } from '@windle/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Monogram } from '@/components/Monogram';
import { OddsNumber, OddsUnit } from '@/components/OddsNumber';
import { SmartImage } from '@/features/media/SmartImage';
import { formatDateTime, shortAddress } from '@/lib/format';
import { OddsBlade } from '../../markets/OddsBlade';
import { TweetView } from '../../tweet/TweetView';
import { toXPost } from '../../tweet/to-x-post';
import { Amount } from '../ui/Amount';
import { TierBadge } from '../ui/TierBadge';
import { type Draft, deadlineMs, normalizeTicker } from './draft';

/** A preset closes its length after creation; a custom date is a fixed moment. */
function closesText(draft: Draft): string {
  if (draft.duration !== 'custom') return `${durationPresetOf(draft.duration).short} after creation`;
  const at = deadlineMs(draft);
  return at === null ? '' : formatDateTime(new Date(at).toISOString());
}

function durationFact(draft: Draft): string {
  if (draft.duration === 'custom') return `Custom · closes ${closesText(draft)}`;
  const preset = durationPresetOf(draft.duration);
  return `${preset.label} · ${preset.short}, counted from creation`;
}

type Props = {
  draft: Draft;
  failure: { message: string; existingSlug?: string | undefined } | null;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-(--hairline) py-3 last:border-b-0 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

/** The market as it will appear in lists, built from the draft. Not interactive. */
function PreviewCard({ draft }: { draft: Draft }) {
  const yes = SIDE_LABELS.community.yes;
  const no = SIDE_LABELS.community.no;
  return (
    <article
      aria-label="Market preview"
      className="flex flex-col gap-4 rounded-xl border border-(--hairline) bg-surface p-4 sm:p-5"
    >
      <header className="flex items-center gap-3">
        <Monogram name={draft.projectName} size="sm" image={draft.image} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-foreground">{draft.projectName.trim()}</span>
          <span className="text-xs font-semibold tracking-[0.12em] text-accent-text">
            ${normalizeTicker(draft.ticker)}
          </span>
          <TierBadge tier="community" />
        </div>
        <span className="inline-flex h-6 shrink-0 items-center rounded-md border border-border-accent/50 px-2 text-xs font-medium text-accent-text">
          Open
        </span>
      </header>
      <p className="text-lg leading-snug font-semibold text-pretty text-foreground">{draft.statement.trim()}</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-foreground">{yes}</span>
          <span className="font-mono text-xl tabular-nums text-foreground">
            <OddsNumber value={draft.oddsPct} />
            <OddsUnit className="text-base text-muted-foreground" />
          </span>
        </div>
        <OddsBlade value={draft.oddsPct} className="h-1 w-full" />
        <p className="text-xs text-muted-foreground">
          {no} {100 - draft.oddsPct}%
        </p>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-(--hairline) pt-3 text-xs text-muted-foreground">
        <span>
          Closes <span className="text-foreground">{closesText(draft)}</span>
        </span>
        <span>
          <Amount value={0} format="whole" /> traded
        </span>
        <span>from @{draft.tweet?.author.handle}</span>
      </footer>
    </article>
  );
}

export function StepReview({ draft, failure }: Props) {
  const mint = draft.mint.trim();
  return (
    <div className="flex flex-col gap-8">
      <PreviewCard draft={draft} />

      <section aria-labelledby="facts" className="flex flex-col gap-1">
        <h3 id="facts" className="text-sm font-semibold text-foreground">
          Key facts
        </h3>
        <dl className="rounded-xl border border-(--hairline) bg-surface px-4">
          <Fact label="Project">
            {draft.projectName.trim()} · ${normalizeTicker(draft.ticker)}
          </Fact>
          {draft.image ? (
            <Fact label="Image">
              <SmartImage
                image={draft.image}
                preset="card"
                sizes="10rem"
                alt={`Image for ${draft.projectName.trim()}`}
                className="w-40 max-w-full rounded-lg border border-(--hairline)"
              />
            </Fact>
          ) : null}
          {mint ? (
            <Fact label="Token mint">
              <span className="font-mono text-xs break-all">{shortAddress(mint, 8, 8)}</span>
            </Fact>
          ) : null}
          <Fact label="Duration">{durationFact(draft)}</Fact>
          <Fact label="Starting odds">
            {draft.oddsPct}% {SIDE_LABELS.community.yes}, {100 - draft.oddsPct}% {SIDE_LABELS.community.no}
          </Fact>
          <Fact label="Resolution criteria">
            <span className="whitespace-pre-wrap">{draft.criteria.trim()}</span>
          </Fact>
          <Fact label="Cost to you">Nothing. Markets are free to create and use practice points.</Fact>
        </dl>
      </section>

      {draft.tweet ? (
        <section aria-labelledby="source" className="flex flex-col gap-2">
          <h3 id="source" className="text-sm font-semibold text-foreground">
            Source tweet
          </h3>
          <TweetView post={toXPost(draft.tweet)} />
        </section>
      ) : null}

      <p className="text-sm text-muted-foreground">
        After you create it the market is public to everyone in windle. Its tweet, statement and criteria cannot be
        changed. Practice points, no real value.
      </p>

      {failure ? (
        <div role="alert" className="flex flex-col gap-1 rounded-xl border border-(--loss)/50 p-4 text-sm">
          <p className="font-medium text-foreground">{failure.message}</p>
          {failure.existingSlug ? (
            <Link
              to={`/m/${failure.existingSlug}`}
              className="w-fit font-medium text-accent-text underline underline-offset-2"
            >
              Open the existing market
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
