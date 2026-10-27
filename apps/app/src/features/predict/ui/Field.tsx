import { type ReactNode, useId } from 'react';

export const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-(--control-border) bg-background px-3 text-sm text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) placeholder:text-muted-foreground aria-invalid:border-(--loss) disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)]:not-disabled:not-aria-invalid:hover:border-border-strong';

type ControlProps = { id: string; 'aria-describedby': string | undefined; 'aria-invalid': true | undefined };

type Props = {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  counter?: ReactNode;
  /** Rows kept free under the control for the error, so showing one moves nothing. */
  errorRows?: 1 | 2;
  children: (control: ControlProps) => ReactNode;
};

export function Field({ label, hint, error, optional, counter, errorRows = 1, children }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
          {optional ? <span className="ml-1.5 font-normal text-muted-foreground">optional</span> : null}
        </label>
        {counter ? <span className="font-mono text-xs text-muted-foreground tabular-nums">{counter}</span> : null}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className={errorRows === 2 ? 'min-h-8' : 'min-h-4 max-sm:min-h-8'}>
        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-(--loss)">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
