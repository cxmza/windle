import { SIDE_LABELS } from '@windle/shared';
import { Slider } from 'radix-ui';
import { type RefObject, useId } from 'react';
import { OddsNumber, OddsUnit } from '@/components/OddsNumber';
import { ImageDropzone } from '@/features/media/ImageDropzone';
import { Field, inputClass } from '../ui/Field';
import { DurationCards } from './DurationCards';
import { type Draft, type Errors, LIMITS } from './draft';

type Props = {
  draft: Draft;
  errors: Errors;
  now: number;
  suggestion: string;
  criteriaRef: RefObject<HTMLTextAreaElement | null>;
  patch: (patch: Partial<Draft>) => void;
  onImageBusy: (busy: boolean) => void;
};

const PROMPTS = [
  { label: 'What counts as YES', prefix: 'YES if:', hint: 'The exact event that must happen before the deadline.' },
  {
    label: 'Source of truth',
    prefix: 'Source of truth:',
    hint: 'Where the resolver will check: a repo, an on-chain address, an official post.',
  },
  {
    label: 'Edge cases',
    prefix: 'Edge cases:',
    hint: 'Partial delivery, delays, a deleted tweet. Say what happens in each.',
  },
] as const;

const CRITERIA_EXAMPLE =
  "YES if: v1 of the launchpad is live on mainnet and anyone can create a pool.\n\nSource of truth: the project's official docs and the program on Solscan.\n\nEdge cases: a closed beta does not count.";

const chip =
  'inline-flex h-8 items-center rounded-md border border-(--hairline) px-2.5 text-xs font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) disabled:cursor-not-allowed disabled:opacity-50 active:not-disabled:bg-(--selected) [@media(hover:hover)]:not-disabled:hover:bg-(--hover)';

const count = (n: number, max: number) => (
  <span className={n > max ? 'text-(--loss)' : undefined}>
    {n}/{max}
  </span>
);

export function StepMarket({ draft, errors, now, suggestion, criteriaRef, patch, onImageBusy }: Props) {
  const oddsId = useId();
  const yes = SIDE_LABELS.community.yes;
  const no = SIDE_LABELS.community.no;
  const statementLen = draft.statement.trim().length;
  const criteriaLen = draft.criteria.trim().length;

  const addPrompt = (prefix: string) => {
    const body = draft.criteria.trimEnd();
    patch({ criteria: body ? `${body}\n\n${prefix} ` : `${prefix} ` });
    requestAnimationFrame(() => {
      const el = criteriaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <legend className="mb-3 text-sm font-semibold text-foreground">Project</legend>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <p className="text-xs font-medium text-foreground">
            Image<span className="ml-1.5 font-normal text-muted-foreground">optional</span>
          </p>
          <ImageDropzone
            kind="market"
            value={draft.image}
            title="Drop the project logo or token image"
            onUploaded={(image) => patch({ image })}
            onRemove={() => patch({ image: null })}
            onBusyChange={onImageBusy}
          />
          <p className="text-xs text-muted-foreground">
            Shown on the market card and in lists. Square pictures work best.
          </p>
          <div className="min-h-4">
            {errors.image ? (
              <p role="alert" className="text-xs font-medium text-(--loss)">
                {errors.image}
              </p>
            ) : null}
          </div>
        </div>
        <Field label="Name" error={errors.projectName}>
          {(c) => (
            <input
              {...c}
              type="text"
              autoComplete="off"
              placeholder="Glowbyte"
              value={draft.projectName}
              onChange={(e) => patch({ projectName: e.target.value })}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Ticker" error={errors.ticker} errorRows={2}>
          {(c) => (
            <input
              {...c}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="$GLOW"
              value={draft.ticker}
              onChange={(e) => patch({ ticker: e.target.value })}
              className={`${inputClass} font-mono uppercase`}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="pump.fun token mint"
            optional
            error={errors.mint}
            hint="The token's mint address, if it has one. Lets people check the project on chain."
          >
            {(c) => (
              <input
                {...c}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy"
                value={draft.mint}
                onChange={(e) => patch({ mint: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Field
          label="Statement"
          error={errors.statement}
          counter={count(statementLen, LIMITS.statement.max)}
          hint="One line that is clearly true or false at the deadline."
        >
          {(c) => (
            <input
              {...c}
              type="text"
              autoComplete="off"
              placeholder="Glowbyte launches v1 of its launchpad by Wednesday"
              value={draft.statement}
              onChange={(e) => patch({ statement: e.target.value, statementTouched: true })}
              className={inputClass}
            />
          )}
        </Field>
        {suggestion && draft.statement !== suggestion ? (
          <button
            type="button"
            onClick={() => patch({ statement: suggestion, statementTouched: false })}
            className="w-fit text-xs font-medium text-accent-text underline underline-offset-2 [@media(hover:hover)]:hover:text-foreground"
          >
            Use the tweet's first sentence
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Field
          label="Resolution criteria"
          error={errors.criteria}
          counter={count(criteriaLen, LIMITS.criteria.max)}
          hint="The resolver reads only this, plus the evidence it finds. Be specific."
        >
          {(c) => (
            <textarea
              {...c}
              ref={criteriaRef}
              rows={7}
              placeholder={CRITERIA_EXAMPLE}
              value={draft.criteria}
              onChange={(e) => patch({ criteria: e.target.value })}
              className={`${inputClass} h-auto min-h-36 resize-y py-2.5 leading-relaxed`}
            />
          )}
        </Field>
        <ul aria-label="Add a prompt" className="flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <li key={p.prefix}>
              <button
                type="button"
                title={p.hint}
                disabled={draft.criteria.toLowerCase().includes(p.prefix.toLowerCase())}
                onClick={() => addPrompt(p.prefix)}
                className={chip}
              >
                <span aria-hidden="true" className="mr-1 text-muted-foreground">
                  +
                </span>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <DurationCards draft={draft} errors={errors} now={now} patch={patch} />

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span id={oddsId} className="text-sm font-semibold text-foreground">
            Starting odds
          </span>
          <p className="font-mono text-sm tabular-nums">
            <span className="text-foreground">
              <OddsNumber value={draft.oddsPct} />
              <OddsUnit />
            </span>{' '}
            <span className="font-sans text-muted-foreground">{yes}</span>
          </p>
        </div>
        <Slider.Root
          min={LIMITS.odds.min}
          max={LIMITS.odds.max}
          step={1}
          value={[draft.oddsPct]}
          onValueChange={([v]) => patch({ oddsPct: v ?? 50 })}
          className="relative flex h-6 w-full touch-none items-center select-none"
        >
          <Slider.Track className="relative h-1.5 grow rounded-full bg-muted">
            <Slider.Range className="absolute h-full rounded-full bg-accent" />
          </Slider.Track>
          <Slider.Thumb
            aria-labelledby={oddsId}
            aria-valuetext={`${draft.oddsPct} percent ${yes}, ${100 - draft.oddsPct} percent ${no}`}
            className="block size-5 rounded-full border-2 border-accent bg-background transition-transform duration-(--dur-instant) ease-(--ease-standard) active:scale-95 [@media(hover:hover)]:hover:scale-110"
          />
        </Slider.Root>
        <p className="text-xs text-muted-foreground">
          Where trading starts, from {LIMITS.odds.min}% to {LIMITS.odds.max}%. The crowd moves it from there. {no}{' '}
          starts at {100 - draft.oddsPct}%.
        </p>
      </div>

      <aside
        aria-labelledby="how-resolves"
        className="flex flex-col gap-3 rounded-xl border border-(--hairline) bg-surface p-4"
      >
        <h3 id="how-resolves" className="text-sm font-semibold text-foreground">
          How this resolves
        </h3>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground marker:font-mono marker:text-foreground">
          <li>After the deadline, the windle resolver proposes an outcome and attaches its evidence.</li>
          <li>A dispute window opens. Anyone can challenge the proposal by posting a bond in points.</li>
          <li>When the window closes the outcome is final and winning positions can be claimed.</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          A project team can later back your market by locking SOL collateral, with an on-chain check that decides it.
          That is not available yet. Until then this is a community market, and everything is practice points.
        </p>
      </aside>
    </div>
  );
}
