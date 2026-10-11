import { Checklist } from './Checklist';
import { Countdown } from './Countdown';
import { Annotation } from './hand/Annotation';

/** Judge chapter widget: time left and the three onchain checks. Illustrative, not live. */
export function JudgePanel() {
  return (
    <section
      aria-label="Deadline and onchain checks (illustrative)"
      data-judge-panel
      className="relative flex w-full max-w-72 flex-col gap-3 border border-border-strong bg-caption p-4 backdrop-blur-md"
    >
      <div className="flex flex-col gap-1">
        <p className="text-kicker uppercase tracking-[0.18em] text-muted-foreground">Deadline in</p>
        <Countdown />
      </div>
      <Checklist />
      <Annotation id="judge-note" className="absolute top-1/2 left-full ml-6 w-48 -translate-y-1/2" />
    </section>
  );
}
