import { type ComponentPropsWithRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { gsap } from '@/lib/gsap';
import { mergeRefs } from '@/lib/merge-refs';
import { DUR } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY } from '@/lib/use-media-query';
import { pad2 } from './format';

/** Example deadline, relative to page load: 3d 04:12:09. */
export const EXAMPLE_REMAINING_MS = (((3 * 24 + 4) * 60 + 12) * 60 + 9) * 1000;

export type Remaining = { days: number; hours: number; minutes: number; seconds: number };

/** Pure: milliseconds left -> d/h/m/s (clamped at 0, whole seconds rounded down). */
export function splitRemaining(ms: number): Remaining {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const PLURAL = new Intl.PluralRules('en-US');
const unit = (n: number, one: string) => `${n} ${PLURAL.select(n) === 'one' ? one : `${one}s`}`;

/** Screen-reader sentence. Deliberately omits seconds, so it only changes (and is announced) once a minute. */
export function describeRemaining({ days, hours, minutes, seconds }: Remaining): string {
  if (days + hours + minutes + seconds === 0) return 'Deadline reached.';
  return `${unit(days, 'day')}, ${unit(hours, 'hour')}, ${unit(minutes, 'minute')} until the deadline.`;
}

function isoDuration({ days, hours, minutes, seconds }: Remaining): string {
  return `P${days}DT${hours}H${minutes}M${seconds}S`;
}

type CountdownProps = Omit<ComponentPropsWithRef<'div'>, 'children'> & {
  /** Time left at mount. Defaults to the story's example deadline. */
  remainingMs?: number;
};

/**
 * One digit slot. Digit roll (feedback that time is passing): when the value changes, the old digit drops out
 * below while the new one drops in from above, clipped to the cell (clip-path, not overflow, so the baseline
 * alignment with "d" and ":" is untouched). transform/opacity only, DUR.fast, so a roll every second stays calm.
 * Reduced motion: the digit just changes.
 */
function DigitCell({ digit }: { digit: string }) {
  const digitRef = useRef<HTMLSpanElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef(digit);

  // layout effect: the roll's start pose is set before the new digit is painted (no one-frame flash)
  useLayoutEffect(() => {
    const prev = shownRef.current;
    shownRef.current = digit;
    const el = digitRef.current;
    const ghost = ghostRef.current;
    if (prev === digit || !el || !ghost || !window.matchMedia(NO_MOTION_PREF_QUERY).matches) return;
    ghost.textContent = prev;
    const enter = gsap.fromTo(el, { yPercent: -70 }, { yPercent: 0, duration: DUR.fast, ease: 'decelerate' });
    const exit = gsap.fromTo(
      ghost,
      { yPercent: 0, opacity: 1 },
      { yPercent: 70, opacity: 0, duration: DUR.fast, ease: 'accelerate' },
    );
    // a newer digit (or unmount) cuts the roll short; the next roll starts from its own fromTo pose
    return () => {
      enter.progress(1).kill();
      exit.progress(1).kill();
    };
  }, [digit]);

  return (
    <span className="relative inline-block min-w-[0.6em] text-center [clip-path:inset(0)]">
      <span ref={digitRef} data-countdown-digit className="inline-block">
        {digit}
      </span>
      <span ref={ghostRef} aria-hidden="true" className="absolute inset-0 opacity-0" />
    </span>
  );
}

/** One unit = a group of single-digit cells, so each digit rolls independently. */
function Digits({ name, value }: { name: keyof Remaining; value: string }) {
  return (
    <span data-countdown-unit={name} className="inline-flex">
      {[...value].map((digit, i) => (
        // positional key on purpose: a cell is a slot (units digit, tens digit), not the character in it
        // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
        <DigitCell key={i} digit={digit} />
      ))}
    </span>
  );
}

/**
 * Deadline countdown, ticking each second. Visual digits are tabular and aria-hidden; the only thing assistive
 * tech gets is a polite live region whose text changes once per minute.
 * Hooks: `[data-countdown]`, `[data-countdown-unit=days|hours|minutes|seconds]`, `[data-countdown-digit]`.
 */
export function Countdown({ remainingMs = EXAMPLE_REMAINING_MS, className, ref, ...props }: CountdownProps) {
  const [deadline] = useState(() => Date.now() + remainingMs);
  const [now, setNow] = useState(() => Date.now());
  // WCAG 2.2.2: the timer updates on its own for longer than 5 s next to other content, so it can be paused.
  // Pausing freezes the display; resuming jumps to the real time left (the deadline itself never moves).
  const [paused, setPaused] = useState(false);
  const remaining = splitRemaining(deadline - now);
  const done = deadline - now <= 0;

  // Off-screen nobody sees the seconds, so the per-second render (and its digit rolls) stops; only the minute is kept
  // current, because that is what the live region announces. Measured: the ticking chapter cost one React commit plus
  // forced style reads every second while the reader was chapters away. A little before it scrolls back in, it
  // catches up to the real time.
  const rootRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true), {
      rootMargin: '25% 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (done || paused) return;
    setNow(Date.now());
    if (onScreen) {
      const id = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(id);
    }
    let id = 0;
    const atNextMinute = () => {
      const left = deadline - Date.now();
      id = window.setTimeout(
        () => {
          setNow(Date.now());
          atNextMinute();
        },
        (left % 60_000 || 60_000) + 1,
      );
    };
    atNextMinute();
    return () => window.clearTimeout(id);
  }, [done, paused, onScreen, deadline]);

  return (
    <div
      ref={mergeRefs(rootRef, ref)}
      data-countdown
      data-paused={paused}
      className={cn('flex items-baseline gap-2', className)}
      {...props}
    >
      <time
        aria-hidden="true"
        dateTime={isoDuration(remaining)}
        className="inline-flex items-baseline gap-1 font-display text-2xl font-extrabold tabular-nums"
      >
        <Digits name="days" value={String(remaining.days)} />
        <span className="text-muted-foreground">d</span>
        <span className="ml-1 inline-flex items-baseline">
          <Digits name="hours" value={pad2(remaining.hours)} />
          <span className="text-muted-foreground">:</span>
          <Digits name="minutes" value={pad2(remaining.minutes)} />
          <span className="text-muted-foreground">:</span>
          <Digits name="seconds" value={pad2(remaining.seconds)} />
        </span>
      </time>
      {!done && (
        <button
          type="button"
          data-countdown-toggle
          onClick={() => setPaused((p) => !p)}
          className="ml-auto min-h-8 px-1 pointer-coarse:min-h-11 text-kicker font-semibold uppercase tracking-[0.12em] underline underline-offset-4 transition-opacity duration-(--dur-fast) ease-standard [@media(hover:hover)]:hover:opacity-70"
        >
          {paused ? 'Resume timer' : 'Pause timer'}
        </button>
      )}
      {/* announces on minute change only: the text has no seconds, so React leaves the node alone in between */}
      <span role="status" aria-live="polite" data-countdown-status className="sr-only">
        {describeRemaining(remaining)}
      </span>
    </div>
  );
}
