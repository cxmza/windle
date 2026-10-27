import { DURATION_PRESETS, type DurationPreset } from '@windle/shared';
import { useId } from 'react';
import { Field, inputClass } from '../ui/Field';
import { RISK_CLASS, RISK_LABEL, type RiskTone } from '../ui/risk';
import { type Draft, dateBounds, type Errors, presetDeadline, timeZoneLabel } from './draft';

type Props = {
  draft: Draft;
  errors: Errors;
  now: number;
  patch: (patch: Partial<Draft>) => void;
};

const QUICK_DAYS = [
  { label: '+7 days', days: 7 },
  { label: '+30 days', days: 30 },
  { label: '+90 days', days: 90 },
] as const;

const chip =
  'inline-flex h-8 items-center rounded-md border border-(--hairline) px-2.5 text-xs font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)';

type CardProps = {
  name: string;
  detail: string;
  strip: string;
  tone: RiskTone;
  selected: boolean;
  onSelect: () => void;
  groupName: string;
  value: string;
  wide?: boolean;
};

function DurationCard({ name, detail, strip, tone, selected, onSelect, groupName, value, wide = false }: CardProps) {
  const t = RISK_CLASS[tone];
  return (
    <label
      data-duration-card={value}
      data-selected={selected || undefined}
      className={`relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
        wide ? 'col-span-full' : ''
      } ${selected ? `${t.text} border-current ${t.wash}` : 'border-(--hairline) [@media(hover:hover)]:hover:bg-(--hover)'}`}
    >
      <input type="radio" name={groupName} value={value} checked={selected} onChange={onSelect} className="sr-only" />
      <span className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-3 text-foreground">
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
      <span
        className={`border-t px-3 py-2 transition-colors duration-(--dur-fast) ease-(--ease-standard) text-[0.6875rem] font-medium tracking-[0.06em] uppercase ${t.text} ${t.wash} ${selected ? 'border-current/40' : 'border-(--hairline)'}`}
      >
        {strip}
      </span>
    </label>
  );
}

const stripOf = (p: DurationPreset): string =>
  p.recommended ? `${RISK_LABEL[p.risk]} • Recommended` : RISK_LABEL[p.risk];

export function DurationCards({ draft, errors, now, patch }: Props) {
  const name = useId();
  const bounds = dateBounds(now);
  const custom = draft.duration === 'custom';

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold text-foreground">How long should it stay open?</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DURATION_PRESETS.map((p) => (
          <DurationCard
            key={p.id}
            groupName={name}
            value={p.id}
            name={p.label}
            detail={p.short}
            strip={stripOf(p)}
            tone={p.risk}
            selected={draft.duration === p.id}
            onSelect={() => patch({ duration: p.id })}
          />
        ))}
        <DurationCard
          wide
          groupName={name}
          value="custom"
          name="Custom date"
          detail="Pick your own deadline"
          strip="Between 1 hour and a year"
          tone="custom"
          selected={custom}
          onSelect={() =>
            patch({
              duration: 'custom',
              ...(draft.deadlineDate && draft.deadlineTime ? {} : presetDeadline(7, now)),
            })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The shorter the market, the more a single trade or a late tweet can swing it. Trading stops when the time runs
        out.
      </p>

      {custom ? (
        <div data-custom-deadline className="flex flex-col gap-3 rounded-lg border border-(--hairline) bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]">
            <Field label="Date" error={errors.deadline}>
              {(c) => (
                <input
                  {...c}
                  type="date"
                  min={bounds.min}
                  max={bounds.max}
                  value={draft.deadlineDate}
                  onChange={(e) => patch({ deadlineDate: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Time">
              {(c) => (
                <input
                  {...c}
                  type="time"
                  value={draft.deadlineTime}
                  onChange={(e) => patch({ deadlineTime: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_DAYS.map((q) => (
              <button key={q.days} type="button" onClick={() => patch(presetDeadline(q.days, now))} className={chip}>
                {q.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">Times are in {timeZoneLabel(now)}.</span>
          </div>
          <p className="text-xs text-muted-foreground">Between one hour and one year from now.</p>
        </div>
      ) : null}
    </fieldset>
  );
}
