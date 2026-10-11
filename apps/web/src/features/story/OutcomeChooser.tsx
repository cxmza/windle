import { RadioGroup } from 'radix-ui';
import { type ComponentPropsWithRef, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';
import { gsap, useGSAP } from '@/lib/gsap';
import { DISTANCE_ENTER, DUR, STAGGER } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY } from '@/lib/use-media-query';
import { OUTCOMES } from './chapters';
import { formatWhole } from './format';
import { Annotation } from './hand/Annotation';
import { addDrawOn } from './hand/draw-on';
import { clearChoice, type OutcomeChoice, setChoice, useOutcomeChoice } from './outcome-choice';

/** The example promise's collateral (same figure as the collateral chapter). */
export const COLLATERAL_USDC = 50_000;

type Ending = Exclude<OutcomeChoice, null>;

/** Where the collateral goes for each ending. */
export const DESTINATIONS = {
  ship: { to: 'back to the team', after: 'YES holders are paid' },
  slash: { to: 'slashed to NO holders', after: 'no refund' },
} as const satisfies Record<Ending, { to: string; after: string }>;

const ENDINGS: readonly Ending[] = ['ship', 'slash'];

function isEnding(value: string): value is Ending {
  return value === 'ship' || value === 'slash';
}

const ITEM =
  'inline-flex relative min-h-11 min-w-24 items-center justify-center border border-border-strong px-5 font-display text-caption font-black text-foreground uppercase tracking-[0.08em] transition-colors duration-(--dur-fast) ease-standard active:scale-[0.98] focus-visible:z-10 data-[state=checked]:font-black data-[state=checked]:border-border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [@media(hover:hover)]:data-[state=unchecked]:hover:bg-emphasis [@media(hover:hover)]:data-[state=unchecked]:hover:text-emphasis-foreground';

function Line({ ending, struck, children }: { ending: Ending; struck: boolean; children: ReactNode }) {
  return (
    <span
      data-destination={ending}
      data-struck={struck}
      aria-hidden={struck || undefined}
      className={cn('block', struck && 'text-muted-foreground max-md:hidden')}
    >
      <span className="relative inline-block">
        {children}
        {struck && (
          <Annotation id="strike-through" stretch className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2" />
        )}
      </span>
    </span>
  );
}

/**
 * "SHIP | SLASH" picker (radio group semantics, arrow keys move + select). Writes to outcome-choice.ts, which the
 * 3D layer reads; with no choice (default) everything keeps following scroll. Shows where the collateral goes.
 */
export function OutcomeChooser({ className, ...props }: Omit<ComponentPropsWithRef<'div'>, 'children'>) {
  const choice = useOutcomeChoice();
  const rootRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(choice);

  // Choice transition (feedback + continuity): the readout lines rise in (one beat apart), then the destination
  // that was NOT picked gets crossed out by hand. Columns dim/undim via CSS (data-choice in Story.tsx); the 3D
  // layer reacts through outcome-choice.ts. Skipped on first render. Reduced motion: instant swap, strike shown.
  useGSAP(
    () => {
      if (shownRef.current === choice) return; // first render (and StrictMode's re-run): nothing changed
      shownRef.current = choice;
      const readout = rootRef.current?.querySelector<HTMLElement>('[data-outcome-readout]');
      if (!readout) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        const lines = readout.querySelectorAll('[data-destination]');
        const targets = lines.length > 0 ? lines : readout;
        const tl = gsap.timeline().from(targets, {
          opacity: 0,
          y: DISTANCE_ENTER / 2,
          duration: DUR.base,
          ease: 'decelerate',
          stagger: STAGGER.line,
        });
        const strike = readout.querySelector('[data-annotation=strike-through]');
        if (strike) addDrawOn(tl, strike, '>-0.05');
      });
    },
    { dependencies: [choice], scope: rootRef, revertOnUpdate: true },
  );

  return (
    <div
      ref={rootRef}
      data-outcome-chooser
      data-choice={choice ?? 'auto'}
      className={cn(
        'flex flex-col gap-3 border border-border-strong bg-caption p-3 text-caption-foreground backdrop-blur-md md:flex-row md:items-center md:justify-between md:gap-6',
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span id="outcome-chooser-label" className="text-kicker font-semibold uppercase tracking-[0.18em]">
          Pick an ending
        </span>
        <RadioGroup.Root
          aria-labelledby="outcome-chooser-label"
          orientation="horizontal"
          value={choice ?? ''}
          onValueChange={(value) => {
            if (isEnding(value)) setChoice(value);
          }}
          className="inline-flex gap-1"
        >
          {ENDINGS.map((ending) => (
            <RadioGroup.Item key={ending} value={ending} data-outcome-option={ending} className={ITEM}>
              {choice === ending && <span aria-hidden="true">&#10003;&nbsp;</span>}
              {OUTCOMES[ending].label}
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
        <button
          type="button"
          data-outcome-auto
          onClick={clearChoice}
          disabled={choice === null}
          className="min-h-8 px-1 text-kicker font-semibold uppercase tracking-[0.12em] underline pointer-coarse:min-h-11 underline-offset-4 transition-opacity duration-(--dur-fast) ease-standard disabled:pointer-events-none disabled:opacity-40 [@media(hover:hover)]:hover:opacity-70"
        >
          Follow scroll
        </button>
      </div>
      <p
        role="status"
        data-outcome-readout
        className="max-w-[44ch] text-kicker font-medium uppercase tracking-[0.06em] tabular-nums md:text-right"
      >
        {choice === null
          ? `Scroll decides. Pick an ending to see where the ${formatWhole(COLLATERAL_USDC)} USDC goes.`
          : ENDINGS.map((ending) => (
              <Line key={ending} ending={ending} struck={ending !== choice}>
                {OUTCOMES[ending].label}: {formatWhole(COLLATERAL_USDC)} USDC {DESTINATIONS[ending].to}
                {ending === choice ? `; ${DESTINATIONS[ending].after}.` : '.'}
              </Line>
            ))}
      </p>
    </div>
  );
}
