import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { PageHeading } from '@/components/PageHeading';
import { ApiRequestError } from '@/lib/api';
import { useClock } from '@/lib/clock';
import { useReducedMotion } from '@/lib/media';
import { cssDuration } from '@/lib/motion';
import { errorMessage, existingSlug } from '../errors';
import { useMarkets, usePredictActions, useTweetPreview } from '../hooks';
import { LookupError } from '../types';
import {
  buildInput,
  clearDraft,
  type Draft,
  type Errors,
  emptyDraft,
  existingMarketFor,
  type FieldKey,
  firstErrorStep,
  loadDraft,
  mapApiError,
  parseUrl,
  type StepIndex,
  saveDraft,
  suggestStatement,
  validateAll,
  validateMarketStep,
  validateTweetStep,
} from './draft';
import { StepMarket } from './StepMarket';
import { Stepper } from './Stepper';
import { StepReview } from './StepReview';
import { type Lookup, StepTweet } from './StepTweet';

const TITLES = ['Paste the tweet', 'Describe the market', 'Review and create'] as const;

const PATCH_FIELD: Partial<Record<keyof Draft, FieldKey>> = {
  url: 'url',
  projectName: 'projectName',
  ticker: 'ticker',
  mint: 'mint',
  image: 'image',
  statement: 'statement',
  criteria: 'criteria',
  duration: 'deadline',
  deadlineDate: 'deadline',
  deadlineTime: 'deadline',
};

type Failure = { message: string; existingSlug?: string | undefined };

function withTweet(d: Draft, tweet: NonNullable<Draft['tweet']>): Draft {
  const parsed = parseUrl(d.url);
  if (!parsed?.ok || parsed.statusId !== tweet.id) return d;
  return {
    ...d,
    tweet,
    statement: d.statementTouched ? d.statement : suggestStatement(tweet.text),
    projectName: d.projectName || tweet.author.name,
  };
}

/** A `?tweet=` link (from the feed) starts a fresh draft for that tweet, unless the stored draft is already about it. */
function initialDraft(tweetParam: string | null): Draft {
  const stored = loadDraft();
  if (!tweetParam) return stored ?? emptyDraft();
  const parsed = parseUrl(tweetParam);
  if (parsed?.ok && stored?.tweet?.id === parsed.statusId) return stored;
  return { ...emptyDraft(), url: tweetParam };
}

export function CreateMarketPage() {
  const navigate = useNavigate();
  const now = useClock('minute');
  const { markets } = useMarkets({ status: 'all', sort: 'new' });
  const { createMarket } = usePredictActions();
  const preview = useTweetPreview();
  const [params, setParams] = useSearchParams();
  const [tweetParam] = useState(() => params.get('tweet'));
  const [draft, setDraft] = useState<Draft>(() => initialDraft(tweetParam));
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [imageBusy, setImageBusy] = useState(false);
  const criteriaRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const [created, setCreated] = useState<string | null>(null);
  const [view, setView] = useState<{ step: StepIndex; dir?: 'forward' | 'back' }>({ step: draft.step });
  if (view.step !== draft.step) setView({ step: draft.step, dir: draft.step > view.step ? 'forward' : 'back' });

  useEffect(() => {
    if (!created) return;
    const open = () => navigate(`/m/${created}`);
    if (reduced) {
      open();
      return;
    }
    const id = window.setTimeout(open, cssDuration('--dur-slow', 420));
    return () => window.clearTimeout(id);
  }, [created, reduced, navigate]);

  useEffect(() => saveDraft(draft), [draft]);

  useEffect(() => {
    if (attempt > 0) document.querySelector<HTMLElement>('[data-wizard-panel] [aria-invalid="true"]')?.focus();
  }, [attempt]);

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    const touched = (Object.keys(p) as (keyof Draft)[]).flatMap((k) => PATCH_FIELD[k] ?? []);
    if (touched.length > 0)
      setServerErrors((e) => {
        const next = { ...e };
        for (const k of touched) delete next[k];
        return next;
      });
  };

  const lookup: Lookup = preview.isPending
    ? { status: 'loading' }
    : preview.isError
      ? {
          status: 'error',
          error:
            preview.error instanceof LookupError
              ? { code: preview.error.code, message: preview.error.message }
              : { code: 'unknown', message: 'Check your connection and try again.' },
        }
      : { status: 'idle' };

  const startLookup = (url: string) =>
    preview.mutate(url, { onSuccess: (tweet) => setDraft((d) => withTweet(d, tweet)) });

  const prefill = useEffectEvent(() => {
    if (tweetParam === null) return;
    const parsed = parseUrl(tweetParam);
    if (parsed?.ok && draft.tweet?.id !== parsed.statusId) startLookup(tweetParam);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('tweet');
        return next;
      },
      { replace: true },
    );
  });
  useEffect(() => prefill(), []);

  const onUrl = (value: string) => {
    setFailure(null);
    const parsed = parseUrl(value);
    if (parsed?.ok) {
      if (draft.tweet?.id === parsed.statusId) {
        patch({ url: value });
        return;
      }
      patch({ url: value, tweet: null });
      startLookup(value);
      return;
    }
    preview.reset();
    patch({ url: value, tweet: null });
  };

  const existing = existingMarketFor(markets, draft.tweet?.id);

  const stepOk = (step: StepIndex): boolean => {
    if (step === 0) return Object.keys(validateTweetStep(draft)).length === 0 && !existing;
    return Object.keys(validateMarketStep(draft, now)).length === 0;
  };
  const reachable = (step: StepIndex): boolean => {
    for (let s = 0; s < step; s++) if (!stepOk(s as StepIndex)) return false;
    return true;
  };

  const go = (step: StepIndex) => {
    requestAnimationFrame(() => headingRef.current?.focus());
    setFailure(null);
    setDraft((d) => ({ ...d, step }));
  };

  const goTo = (step: StepIndex) => {
    setShowErrors(false);
    go(step);
  };

  const create = async () => {
    const errors = validateAll(draft, now);
    const input = buildInput(draft);
    const back = firstErrorStep(errors);
    if (back !== null || !input) {
      setShowErrors(true);
      go(back ?? 0);
      setAttempt((n) => n + 1);
      return;
    }
    setFailure(null);
    try {
      const market = await createMarket.mutateAsync(input);
      clearDraft();
      setCreated(market.slug);
    } catch (error) {
      const message = errorMessage(error, 'Could not create the market. Try again.');
      if (!(error instanceof ApiRequestError) || error.kind !== 'http') {
        setFailure({ message });
        return;
      }
      const { errors: fields, rest } = mapApiError(error.code, message);
      const step = firstErrorStep(fields);
      if (step !== null) {
        setServerErrors(fields);
        setShowErrors(true);
        go(step);
        setAttempt((n) => n + 1);
        if (rest.length > 0) setFailure({ message: rest.join(' ') });
        return;
      }
      setFailure({ message, existingSlug: existingSlug(error) });
    }
  };

  const next = () => {
    setShowErrors(true);
    if (!stepOk(draft.step)) {
      setAttempt((n) => n + 1);
      return;
    }
    setShowErrors(false);
    go((draft.step + 1) as StepIndex);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (createMarket.isPending || created || lookup.status === 'loading') return;
    if (draft.step === 2) void create();
    else next();
  };

  const clientErrors: Errors = showErrors
    ? draft.step === 0
      ? validateTweetStep(draft)
      : validateMarketStep(draft, now)
    : {};
  const errors: Errors = { ...clientErrors, ...serverErrors };
  const suggestion = draft.tweet ? suggestStatement(draft.tweet.text) : '';
  const busy = createMarket.isPending || created !== null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeading
        title="Create a market"
        lede="Someone made a promise on X? Paste the tweet and open a market on whether they keep it."
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <Stepper current={draft.step} reachable={reachable} onGo={goTo} />
          <p className="text-xs text-muted-foreground">Practice points. No real value.</p>
        </div>

        <form
          noValidate
          onSubmit={onSubmit}
          aria-busy={busy}
          data-created={created ? true : undefined}
          className="flex flex-col gap-8 overflow-x-clip rounded-2xl border border-(--hairline) bg-surface/60 p-5 sm:p-6"
        >
          <section
            key={view.step}
            data-wizard-panel
            data-pane-view
            data-dir={view.dir}
            aria-labelledby="step-title"
            className="flex flex-col gap-6"
          >
            <h2
              id="step-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-semibold text-foreground outline-none"
            >
              <span className="mr-2 font-mono text-muted-foreground">{draft.step + 1}.</span>
              {TITLES[draft.step]}
            </h2>
            {draft.step === 0 ? (
              <StepTweet
                draft={draft}
                lookup={lookup}
                existing={existing}
                showError={showErrors}
                onUrl={onUrl}
                onRetry={() => startLookup(draft.url)}
              />
            ) : draft.step === 1 ? (
              <StepMarket
                draft={draft}
                errors={errors}
                now={now}
                suggestion={suggestion}
                criteriaRef={criteriaRef}
                patch={patch}
                onImageBusy={setImageBusy}
              />
            ) : (
              <StepReview draft={draft} failure={failure} />
            )}
          </section>

          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex rounded-b-2xl items-center justify-between gap-3 border-t border-(--hairline) bg-background px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
            {draft.step > 0 ? (
              <Button variant="secondary" disabled={busy} onClick={() => goTo((draft.step - 1) as StepIndex)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {draft.step < 2 ? (
              <Button
                type="submit"
                disabled={
                  lookup.status === 'loading' ||
                  (draft.step === 0 && Boolean(existing)) ||
                  (draft.step === 1 && imageBusy)
                }
              >
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={busy}>
                {created ? (
                  <span data-created-label className="inline-flex items-center gap-2">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Market created
                  </span>
                ) : busy ? (
                  'Creating…'
                ) : (
                  'Create market'
                )}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
