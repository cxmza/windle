import { STEPS, type StepIndex } from './draft';

type Props = {
  current: StepIndex;
  reachable: (step: StepIndex) => boolean;
  onGo: (step: StepIndex) => void;
};

const marker =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs tabular-nums';

export function Stepper({ current, reachable, onGo }: Props) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((label, i) => {
          const step = i as StepIndex;
          const done = step < current;
          const here = step === current;
          const canGo = !here && reachable(step);
          const body = (
            <>
              <span
                aria-hidden="true"
                className={`${marker} ${here ? 'border-transparent bg-accent text-accent-foreground' : done ? 'border-border-accent/60 text-accent-text' : 'border-(--hairline) text-muted-foreground'}`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={here ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              {done ? <span className="sr-only"> (completed)</span> : null}
            </>
          );
          return (
            <li key={label} className="flex items-center gap-2 sm:gap-3">
              {i > 0 ? <span aria-hidden="true" className="h-px w-5 bg-(--hairline) sm:w-10" /> : null}
              {here ? (
                <span aria-current="step" className="inline-flex items-center gap-2 text-sm font-medium">
                  {body}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canGo}
                  onClick={() => onGo(step)}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md px-1.5 text-sm font-medium transition-colors duration-(--dur-instant) ease-(--ease-standard) disabled:cursor-not-allowed disabled:opacity-60 active:not-disabled:bg-(--selected) [@media(hover:hover)]:not-disabled:hover:bg-(--hover)"
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
