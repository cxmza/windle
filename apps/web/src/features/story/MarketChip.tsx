import { type ComponentPropsWithRef, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { mergeRefs } from '@/lib/merge-refs';
import { DUR, EASE_BEZIER } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY, REDUCED_MOTION_QUERY } from '@/lib/use-media-query';
import { EXAMPLE_MARKET } from './chapters';
import { buy, reset, STAKE, useDemoMarket } from './demo-market';
import { formatAmount, formatCents } from './format';

/** Scroll velocity (px/s) above which the price "ticks". */
const TICK_VELOCITY = 400;
/** Minimum gap between ticks, seconds — keeps it well under 3 changes/s (WCAG 2.3.1). */
const TICK_GAP = 0.4;

/** Trade pulse: the glow layer flashes once (single pulse, well under the 3 flashes/s of WCAG 2.3.1). */
const TRADE_PULSE: Keyframe[] = [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }];

const BUTTON =
  'inline-flex min-h-11 flex-1 items-center justify-center border border-border-strong px-3 text-caption font-semibold uppercase tracking-[0.08em] transition-[color,background-color,box-shadow] duration-(--dur-fast) ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';

/**
 * Interactive DEMO market (local store, see demo-market.ts; no chain, no funds). The prices, bar and meter follow
 * the store; the opening example is still EXAMPLE_MARKET (72 / 28).
 */
export function MarketChip({ className, ref, ...props }: ComponentPropsWithRef<'figure'>) {
  const { yes, no, position, trades } = useDemoMarket();
  const { question } = EXAMPLE_MARKET;
  const figRef = useRef<HTMLElement>(null);
  const yesRef = useRef<HTMLSpanElement>(null);
  const noRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const yesGlowRef = useRef<HTMLSpanElement>(null);
  const noGlowRef = useRef<HTMLSpanElement>(null);
  const pulseRef = useRef<Animation | null>(null);
  // Short live-region text for the last trade (the full position summary is a plain paragraph).
  const [lastBought, setLastBought] = useState<'YES' | 'NO' | null>(null);

  // Trade feedback: either buy confirms with one glow pulse on its own button (opacity of a static halo layer: blue
  // shadow-glow on YES, neutral border-strong halo on NO; WAAPI so a rapid second trade restarts it). Reduced motion:
  // no pulse; the price, bar and position line already confirm the trade.
  const trade = (side: 'yes' | 'no') => {
    buy(side);
    setLastBought(side === 'yes' ? 'YES' : 'NO');
    const glow = (side === 'yes' ? yesGlowRef : noGlowRef).current;
    if (!glow || typeof glow.animate !== 'function' || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
    pulseRef.current?.cancel();
    pulseRef.current = glow.animate(TRADE_PULSE, {
      duration: DUR.slower * 1000,
      easing: `cubic-bezier(${EASE_BEZIER.standard.join(',')})`,
    });
  };
  useEffect(() => () => pulseRef.current?.cancel(), []);
  // The price spans are written imperatively (GSAP count-up / ticks), so React renders their text only once.
  const [opening] = useState({ yes, no });
  // Latest store prices for the GSAP block below (read lazily so the timeline never needs rebuilding).
  const baseRef = useRef({ yes, no });
  // Set by the GSAP block while motion is allowed; re-paints the settled readout after a trade.
  const syncRef = useRef<(() => void) | null>(null);

  // Store -> DOM. With motion the GSAP block repaints (and keeps its count-up honest); without it (reduced
  // motion, tests) the readout is painted directly.
  useEffect(() => {
    baseRef.current = { yes, no };
    if (syncRef.current) {
      syncRef.current();
      return;
    }
    if (yesRef.current) yesRef.current.textContent = formatCents(yes);
    if (noRef.current) noRef.current.textContent = formatCents(no);
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${yes / 100})`;
  }, [yes, no]);

  // Feedback that this is a live-feeling market: on enter the bar fills to the YES share and prices count up;
  // while the chapter is scrolled fast, YES ticks +-1c and settles back. Reduced motion: static values.
  useGSAP(
    () => {
      const fig = figRef.current;
      const yesEl = yesRef.current;
      const noEl = noRef.current;
      const fill = fillRef.current;
      const section = fig?.closest<HTMLElement>('[data-chapter]');
      if (!fig || !yesEl || !noEl || !fill || !section) return;

      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        const price = { yes: 0, no: 0 };
        const setFill = gsap.quickSetter(fill, 'scaleX');
        const render = () => {
          yesEl.textContent = formatCents(Math.round(price.yes));
          noEl.textContent = formatCents(Math.round(price.no));
          setFill(price.yes / 100);
        };
        render();
        let settled = false;
        const countUp = gsap.to(price, {
          yes: () => baseRef.current.yes,
          no: () => baseRef.current.no,
          duration: DUR.slower,
          ease: 'decelerate',
          paused: true,
          onUpdate: render,
          onComplete: () => {
            settled = true;
          },
        });
        ScrollTrigger.create({
          trigger: fig,
          start: 'top 85%',
          end: 'max',
          onEnter: () => countUp.play(),
        });

        let lastTick = 0;
        let settleTween: gsap.core.Tween | null = null;
        ScrollTrigger.create({
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => {
            const now = gsap.ticker.time;
            if (!settled || Math.abs(self.getVelocity()) < TICK_VELOCITY || now - lastTick < TICK_GAP) return;
            lastTick = now;
            const delta = self.direction;
            price.yes = baseRef.current.yes + delta;
            price.no = baseRef.current.no - delta;
            render();
            gsap.fromTo(yesEl, { y: -3 * delta }, { y: 0, duration: DUR.fast, ease: 'decelerate' });
            settleTween?.kill();
            settleTween = gsap.delayedCall(DUR.slow, () => {
              price.yes = baseRef.current.yes;
              price.no = baseRef.current.no;
              render();
            });
          },
        });
        // Trade reaction (feedback): the figures and the bar run to the new price within --dur-base, the figure
        // that rose nudges up and the one that fell nudges down, and the position line blinks in. Interruptible:
        // rapid clicks retarget the same tween. Before the count-up has started, its play() picks the base up.
        const position = fig.querySelector<HTMLElement>('[data-position]');
        let tradeTween: gsap.core.Tween | null = null;
        syncRef.current = () => {
          // a trade mid count-up: the count-up's end values were read when it started, so hand over to the trade
          if (!settled && countUp.isActive()) {
            countUp.kill();
            settled = true;
          }
          if (!settled) return;
          const dir = Math.sign(baseRef.current.yes - price.yes);
          settleTween?.kill();
          tradeTween?.kill();
          tradeTween = gsap.to(price, {
            yes: baseRef.current.yes,
            no: baseRef.current.no,
            duration: DUR.base,
            ease: 'standard',
            onUpdate: render,
          });
          if (dir !== 0) {
            const nudge = { duration: DUR.base, ease: 'decelerate', overwrite: true } as const;
            gsap.fromTo(yesEl, { y: 4 * dir }, { y: 0, ...nudge });
            gsap.fromTo(noEl, { y: -4 * dir }, { y: 0, ...nudge });
          }
          if (position) {
            gsap.fromTo(
              position,
              { opacity: 0.35 },
              { opacity: 1, duration: DUR.base, ease: 'standard', overwrite: true },
            );
          }
        };
        return () => {
          syncRef.current = null;
          price.yes = baseRef.current.yes;
          price.no = baseRef.current.no;
          render();
        };
      });
    },
    { scope: figRef },
  );

  const hasPosition = position.yesShares > 0 || position.noShares > 0;

  return (
    <figure
      ref={mergeRefs(figRef, ref)}
      data-market-chip
      data-trades={trades}
      className={cn('w-full max-w-72 border border-border-strong bg-caption p-4 backdrop-blur-md', className)}
      {...props}
    >
      <figcaption className="flex items-baseline justify-between gap-3 text-kicker uppercase tracking-[0.18em] text-muted-foreground">
        <span className="truncate">{question}</span>
        <span className="shrink-0 border border-border px-1.5 py-0.5">Demo</span>
      </figcaption>
      <div className="mt-3 flex justify-between font-display text-2xl font-extrabold tabular-nums">
        <span>
          YES{' '}
          <span ref={yesRef} data-price="yes" className="inline-block text-foreground">
            {formatCents(opening.yes)}
          </span>
        </span>
        <span className="text-muted-foreground">
          NO{' '}
          <span ref={noRef} data-price="no" className="inline-block">
            {formatCents(opening.no)}
          </span>
        </span>
      </div>
      {/* semantic value for assistive tech; the bar below is its visual twin (UA meter styling can't be
          fully overridden in Chromium, and a transform fill animates on the compositor) */}
      <meter
        min={0}
        max={100}
        value={yes}
        aria-label={`Demo market: YES ${yes} cents, NO ${no} cents`}
        className="sr-only"
      />
      <span aria-hidden="true" className="mt-3 block h-1 w-full overflow-hidden bg-surface-navy">
        <span
          ref={fillRef}
          className="block h-full w-full origin-left bg-accent"
          style={{ transform: `scaleX(${opening.yes / 100})` }}
        />
      </span>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-buy="yes"
          onClick={() => trade('yes')}
          className={cn(
            BUTTON,
            // Buy YES: electric blue, deeper blue + glow on hover; glow pulse on trade (trade)
            'relative border-border-accent bg-accent text-accent-foreground [@media(hover:hover)]:hover:bg-accent-hover [@media(hover:hover)]:hover:shadow-glow',
          )}
        >
          <span
            ref={yesGlowRef}
            aria-hidden="true"
            data-trade-glow="yes"
            className="pointer-events-none absolute inset-0 opacity-0 shadow-glow"
          />
          Buy YES
        </button>
        <button
          type="button"
          data-buy="no"
          onClick={() => trade('no')}
          className={cn(
            BUTTON,
            // Buy NO: neutral; same single pulse as YES, in the border-strong halo (trade)
            'relative bg-transparent text-foreground [@media(hover:hover)]:hover:bg-emphasis [@media(hover:hover)]:hover:text-emphasis-foreground',
          )}
        >
          <span
            ref={noGlowRef}
            aria-hidden="true"
            data-trade-glow="no"
            className="pointer-events-none absolute inset-0 opacity-0 shadow-[0_0_0_1px_var(--border-strong),0_0_24px_2px_var(--border-strong)]"
          />
          Buy NO
        </button>
      </div>
      <p data-position data-hand-avoid className="mt-2 text-kicker tabular-nums text-muted-foreground">
        {hasPosition
          ? `You hold ${formatAmount(position.yesShares)} YES, ${formatAmount(position.noShares)} NO. Spent ${formatAmount(position.spent)}, worth ${formatAmount(position.value)}.`
          : `No position yet. Each buy spends ${formatAmount(STAKE)} demo USDC.`}
      </p>
      <span role="status" data-trade-status className="sr-only">
        {lastBought ? `Bought ${formatAmount(STAKE)} USDC of ${lastBought}` : ''}
      </span>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-kicker uppercase tracking-[0.12em]">
        <span data-demo-label data-hand-avoid className="text-muted-foreground">
          Demo &mdash; no real funds
        </span>
        <button
          type="button"
          data-reset
          onClick={() => {
            reset();
            setLastBought(null);
          }}
          disabled={trades === 0}
          className="min-h-8 px-1 font-semibold underline pointer-coarse:min-h-11 underline-offset-4 transition-opacity duration-(--dur-fast) ease-standard disabled:pointer-events-none disabled:opacity-40 [@media(hover:hover)]:hover:opacity-70"
        >
          Reset
        </button>
      </div>
    </figure>
  );
}
