import { lazy, type ReactNode, Suspense, startTransition, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { afterFirstPaint, canWaitForFirstPaint } from '@/lib/first-paint';
import { gsap, primeTransforms, useGSAP } from '@/lib/gsap';
import { whenIdle } from '@/lib/idle';
import { DISTANCE_ENTER, DUR, INTRO, STAGGER } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY, REDUCED_MOTION_QUERY } from '@/lib/use-media-query';
import { CAPTION_LANDED, CAPTION_LEAVING, Caption } from './Caption';
import { Chapter, ChapterTitle, Kicker } from './Chapter';
import { CtaLink } from './CtaLink';
import { CHAPTERS, type Chapter as ChapterData, type ChapterKey, CTAS, OUTCOMES } from './chapters';
import { Ecosystem } from './Ecosystem';
import { HeroKicker } from './HeroKicker';
import { AnchoredAnnotation } from './hand/AnchoredAnnotation';
import { Annotation } from './hand/Annotation';
import { addDrawOn, drawOn, playDraw, undraw } from './hand/draw-on';
import { JudgePanel } from './JudgePanel';
import { MarketChip } from './MarketChip';
import { useOutcomeChoice } from './outcome-choice';
import { markStoryReady, remeasureStory, useStoryScrollDriver } from './story-scroll';

// Radix RadioGroup + the chooser: a chunk of its own, loaded when the outcome chapter mounts (after first paint).
const OutcomeChooser = lazy(() => import('./OutcomeChooser').then((m) => ({ default: m.OutcomeChooser })));

type CtaRowProps = {
  /** Centre the buttons (hero and final CTA stages are centred). */
  centered?: boolean;
  /** Final CTA: destinations don't exist yet, so render them as disabled with a visible status. */
  comingSoon?: boolean;
};

function CtaRow({ centered = false, comingSoon = false }: CtaRowProps) {
  return (
    <div data-cta-row className={cn('flex flex-wrap gap-3', centered && 'justify-center')}>
      {CTAS.map((cta) =>
        comingSoon ? (
          <CtaLink key={cta.label} role="link" aria-disabled="true" aria-describedby="cta-status" variant={cta.variant}>
            {cta.label}
          </CtaLink>
        ) : (
          <CtaLink key={cta.label} href={cta.href} variant={cta.variant}>
            {cta.label}
          </CtaLink>
        ),
      )}
    </div>
  );
}

const UNDERLINED_WORD = 'judge';

/** Hero sub-line; the word "judge" carries a small hand-drawn underline that hangs below the text (not in it). */
function HeroSub({ text }: { text: string }) {
  const at = text.indexOf(UNDERLINED_WORD);
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <span data-annotate-word={UNDERLINED_WORD} className="relative inline-block">
        {UNDERLINED_WORD}
        <Annotation id="hero-underline" className="absolute top-full left-0 -mt-1 w-full" />
      </span>
      {text.slice(at + UNDERLINED_WORD.length)}
    </>
  );
}

function Hero({ chapter }: { chapter: ChapterData }) {
  const heroRef = useRef<HTMLElement>(null);

  // Hero intro (attention): kicker (CSS sweep, HeroKicker.tsx), then the title assembles (ChapterTitle, h1 branch), then the sub and CTAs
  // rise in. The 3D monolith arrives from depth in parallel (scene/StoryScene.tsx).
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        const tl = gsap
          .timeline()
          .from('[data-hero-sub]', { opacity: 0, y: DISTANCE_ENTER, duration: DUR.slow, ease: 'decelerate' }, INTRO.sub)
          .from(
            '[data-cta-row] > *',
            { opacity: 0, y: DISTANCE_ENTER, duration: DUR.slow, ease: 'decelerate', stagger: STAGGER.item },
            INTRO.cta,
          );
        // margin note (attention, character): once the sub-line has landed, "judge" gets underlined by hand
        const underline = heroRef.current?.querySelector('[data-annotation=hero-underline]');
        if (underline) addDrawOn(tl, underline, INTRO.sub + DUR.slow);
      });
      mm.add(REDUCED_MOTION_QUERY, () => {
        gsap.from('[data-hero-kicker], [data-hero-sub], [data-cta-row]', {
          opacity: 0,
          duration: DUR.instant,
          ease: 'standard',
        });
      });
    },
    { scope: heroRef },
  );

  return (
    <Chapter ref={heroRef} chapter={chapter} stageClassName="items-center text-center">
      <div data-hero-kicker>
        <HeroKicker text={chapter.kicker} />
      </div>
      {/* Safety-net scrim: a soft caption-coloured radial fade behind the title (does not touch the monolith pose). */}
      <div
        data-hero-scrim
        className="relative isolate before:pointer-events-none before:absolute before:-inset-x-[min(10%,var(--gutter))] before:-inset-y-6 before:-z-10 before:bg-[radial-gradient(closest-side,var(--caption),transparent)] before:opacity-70 before:content-['']"
      >
        <ChapterTitle chapter={chapter} as="h1" size="hero" />
      </div>
      <p
        data-hero-sub
        className="max-w-[44ch] text-pretty bg-caption px-3 py-2 text-lede text-caption-foreground backdrop-blur-md"
      >
        <HeroSub text={chapter.caption} />
      </p>
      <CtaRow centered />
    </Chapter>
  );
}

const SIDE_BY_ID: Partial<Record<ChapterKey, string>> = {
  promise: 'items-start',
  collateral: 'items-end text-right',
  market: 'items-start',
  incentive: 'items-end text-right',
  judge: 'items-start',
};

function Narrative({ chapter, children }: { chapter: ChapterData; children?: ReactNode }) {
  const side = SIDE_BY_ID[chapter.id] ?? 'items-start';
  const chapterRef = useRef<HTMLElement>(null);

  // Margin notes (attention): the chapter's annotations are sketched in once its caption has landed (after the
  // emphasis wipe), one after another, and erased faster as the caption reverses on scroll back.
  // Reduced motion: never built, so the finished drawings are shown.
  useGSAP(
    () => {
      const stage = chapterRef.current?.querySelector<HTMLElement>('[data-chapter-stage]');
      const annotations = stage?.querySelectorAll<HTMLElement>('[data-annotation]');
      if (!stage || !annotations || annotations.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        const tl = drawOn(annotations);
        const onLanded = () => playDraw(tl);
        const onLeaving = () => undraw(tl);
        stage.addEventListener(CAPTION_LANDED, onLanded);
        stage.addEventListener(CAPTION_LEAVING, onLeaving);
        return () => {
          stage.removeEventListener(CAPTION_LANDED, onLanded);
          stage.removeEventListener(CAPTION_LEAVING, onLeaving);
        };
      });
    },
    { scope: chapterRef },
  );

  return (
    <Chapter ref={chapterRef} chapter={chapter} stageClassName={side}>
      <Kicker>{chapter.kicker}</Kicker>
      <ChapterTitle chapter={chapter} className="max-w-[16ch]" />
      <Caption
        text={chapter.caption}
        emphasis={chapter.emphasis}
        className={side.includes('text-right') ? 'text-left' : ''}
      />
      {children}
    </Chapter>
  );
}

/**
 * SLASH glyphs crack loose: drop a few px, tilt, dim. The word must stay readable at the end of the scrub —
 * the fall is the effect, not the loss of the word.
 */
const SHATTER = { fall: [8, 24], tilt: 12, rest: 0.6 } as const;
const SHIP_LIFT = DISTANCE_ENTER * 1.5;
/** Scrub progress at which the verdicts have landed and the margin notes get sketched in. */
const OUTCOME_NOTES_AT = 0.6;

function Outcome({ chapter }: { chapter: ChapterData }) {
  const outcomeRef = useRef<HTMLElement>(null);
  const choice = useOutcomeChoice();

  // Outcome split (continuity with the 3D cube splitting behind it), scrubbed over the chapter's hold:
  // a seam draws down the middle, SHIP lifts and its verdict inverts to white, SLASH's letters crack apart
  // and drop out of line while its verdict sags. Reduced motion: the final state, static — the SHIP verdict is
  // inverted by default (its fill is only collapsed under `motion-safe`), nothing moves.
  useGSAP(
    () => {
      const root = outcomeRef.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        // chars are pre-split in render (no SplitText: its Intl.Segmenter init cost ~0.7 s of the mobile-4x boot)
        const chars = root.querySelectorAll<HTMLElement>('[data-outcome=slash] [data-outcome-label] [data-char]');
        // margin notes: drawn (not scrubbed) once the verdicts have landed; erased faster when scrolled back above
        const notes = drawOn(root.querySelectorAll('[data-annotation^=outcome-]'));
        let notesShown = false;
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
            onUpdate: (self) => {
              const show = self.progress >= OUTCOME_NOTES_AT;
              if (show === notesShown) return;
              notesShown = show;
              if (show) playDraw(notes);
              else undraw(notes);
            },
          },
        });
        tl.fromTo('[data-outcome-seam]', { scaleY: 0 }, { scaleY: 1, duration: 0.25 }, 0)
          .to('[data-outcome=ship]', { y: -SHIP_LIFT, duration: 0.7 }, 0.15)
          // verdict inverts to white via a difference-blend wipe: every pixel is either normal or inverted,
          // so the text stays readable at any scrub position
          .fromTo('[data-verdict-fill]', { scaleX: 0 }, { scaleX: 1, duration: 0.2 }, 0.55)
          .to('[data-outcome=slash] [data-outcome-verdict]', { y: DISTANCE_ENTER, rotation: 1.5, duration: 0.6 }, 0.3);
        if (chars.length > 0) {
          primeTransforms(chars);
          tl.to(
            chars,
            {
              y: () => gsap.utils.random(SHATTER.fall[0], SHATTER.fall[1]),
              rotation: () => gsap.utils.random(-SHATTER.tilt, SHATTER.tilt),
              opacity: SHATTER.rest,
              duration: 0.6,
              stagger: { each: 0.03, from: 'random' },
            },
            0.3,
          );
        }
      });
    },
    { scope: outcomeRef },
  );

  return (
    <Chapter
      ref={outcomeRef}
      chapter={chapter}
      stageClassName="!px-0 !gap-0 pb-[calc(var(--gutter)+6rem)] md:pb-[calc(var(--gutter)+3rem)]"
    >
      <ChapterTitle chapter={chapter} className="sr-only" />
      <span
        data-outcome-seam
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px origin-top bg-border-strong max-md:hidden"
      />
      <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
        {(['ship', 'slash'] as const).map((key) => {
          const o = OUTCOMES[key];
          return (
            <div
              key={key}
              data-outcome={key}
              data-choice={choice === null ? 'auto' : choice === key ? 'chosen' : 'dimmed'}
              className="relative flex flex-col justify-center gap-4 border-border-strong px-(--gutter) py-8 transition-opacity duration-(--dur-base) ease-standard max-md:border-b data-[choice=dimmed]:opacity-40"
            >
              <p className="font-display text-split font-black uppercase">
                <span data-outcome-label className="inline-block">
                  {key === 'slash'
                    ? Array.from(o.label, (ch, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: chars of a static label
                        <span key={i} data-char className="relative inline-block">
                          {ch}
                        </span>
                      ))
                    : o.label}
                </span>{' '}
                <span aria-hidden="true">{o.arrow}</span>
                <span className="sr-only">:</span>
              </p>
              <p
                data-outcome-verdict
                className="relative max-w-[24ch] border border-border-strong bg-caption p-4 text-caption font-medium uppercase text-caption-foreground backdrop-blur-md"
              >
                {o.result}
                {key === 'ship' && (
                  <span
                    data-verdict-fill
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 origin-left bg-emphasis mix-blend-difference motion-safe:[transform:scaleX(0)]"
                  />
                )}
              </p>
              <Annotation id={`outcome-${key}`} className="absolute top-1/2 left-(--gutter) mt-24 w-52" />
            </div>
          );
        })}
      </div>
      <Suspense fallback={null}>
        <OutcomeChooser className="absolute inset-x-(--gutter) bottom-(--gutter)" />
      </Suspense>
    </Chapter>
  );
}

function FinalCta({ chapter }: { chapter: ChapterData }) {
  return (
    <Chapter chapter={chapter} stageClassName="items-center text-center">
      <ChapterTitle chapter={chapter} className="max-w-[18ch]" />
      <CtaRow centered comingSoon />
      <p id="cta-status" className="text-kicker font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Coming soon
      </p>
    </Chapter>
  );
}

/**
 * Below-the-fold chapter before its content mounts: same id, index hook and height, so anchors, the dock and every
 * scroll measurement are already right. Content mounts chapter by chapter after first paint (useDeferredChapters).
 */
function ChapterPlaceholder({ chapter }: { chapter: ChapterData }) {
  return (
    <section
      id={chapter.id}
      data-chapter={chapter.index}
      data-scene={chapter.scene}
      data-placeholder
      style={{ minHeight: `${chapter.heightVh}svh` }}
      className="relative z-10"
    />
  );
}

/** How far below the viewport (in viewports) a placeholder counts as about to be reached. */
const MOUNT_AHEAD_VIEWPORTS = 2;

/** True when the chapter's section (placeholder) starts within MOUNT_AHEAD_VIEWPORTS below the viewport, or above. */
function isNearViewport(id: string): boolean {
  const el = document.getElementById(id);
  return el !== null && el.getBoundingClientRect().top < window.innerHeight * (1 + MOUNT_AHEAD_VIEWPORTS);
}

/**
 * How many chapters are mounted. First commit: the hero only (measured on mobile-4x: rendering + styling the whole
 * story in the first commit was ~1.2 s before first paint). After first paint the rest mount one per idle period —
 * small commits instead of one long task — then the story ranges are re-measured. Without paint timing / idle
 * callbacks (jsdom, older Safari) everything renders at once, as before.
 */
function useDeferredChapters(): number {
  const [count, setCount] = useState(() => (canWaitForFirstPaint() ? 1 : CHAPTERS.length));
  useEffect(() => {
    if (count >= CHAPTERS.length) return;
    // transition: React renders the chapter in time slices (yielding to input); only its commit is one task
    const next = () => startTransition(() => setCount((n) => n + 1));
    if (count === 1) return afterFirstPaint(next);
    // mid-scroll the mount waits for the scroll to settle (lib/idle.ts), unless the reader is about to reach it
    const upcoming = CHAPTERS[count];
    return whenIdle(next, { urgent: () => upcoming !== undefined && isNearViewport(upcoming.id) });
  }, [count]);
  const deferred = useRef(count < CHAPTERS.length);
  useEffect(() => {
    if (count < CHAPTERS.length) return;
    if (deferred.current) {
      deferred.current = false;
      // section heights are unchanged (placeholders match), so no global ScrollTrigger.refresh: the new triggers
      // measured themselves on creation; only the story ranges pick up the real stage heights
      remeasureStory();
    }
    markStoryReady(); // deep links (/market) wait for this before scrolling
  }, [count]);
  return count;
}

export function Story() {
  const mainRef = useRef<HTMLElement>(null);
  useStoryScrollDriver(mainRef);
  const mounted = useDeferredChapters();
  return (
    <main ref={mainRef} id="main" tabIndex={-1} className="outline-none">
      {CHAPTERS.map((chapter) => {
        if (chapter.index >= mounted) return <ChapterPlaceholder key={chapter.id} chapter={chapter} />;
        switch (chapter.id) {
          case 'hero':
            return <Hero key={chapter.id} chapter={chapter} />;
          case 'market':
            return (
              <Narrative key={chapter.id} chapter={chapter}>
                <div className="relative w-full max-w-72">
                  <MarketChip />
                  <Annotation id="market-odds" className="absolute top-full left-6 -mt-1 w-60" />
                </div>
              </Narrative>
            );
          case 'incentive':
            return (
              <Narrative key={chapter.id} chapter={chapter}>
                <AnchoredAnnotation id="incentive-loop" target="[data-caption] mark[data-emphasis]" />
              </Narrative>
            );
          case 'judge':
            return (
              <Narrative key={chapter.id} chapter={chapter}>
                <JudgePanel />
              </Narrative>
            );
          case 'outcome':
            return <Outcome key={chapter.id} chapter={chapter} />;
          case 'ecosystem':
            return <Ecosystem key={chapter.id} chapter={chapter} />;
          case 'cta':
            return <FinalCta key={chapter.id} chapter={chapter} />;
          default:
            return <Narrative key={chapter.id} chapter={chapter} />;
        }
      })}
    </main>
  );
}
