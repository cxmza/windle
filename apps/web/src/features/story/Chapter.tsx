import { type ComponentPropsWithRef, Fragment, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';
import { gsap, primeTransforms, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { whenIdle } from '@/lib/idle';
import { mergeRefs } from '@/lib/merge-refs';
import { DISTANCE_ENTER, DUR, EXIT_SPEED, INTRO, STAGGER } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY, REDUCED_MOTION_QUERY } from '@/lib/use-media-query';
import { Emphasize } from './Caption';
import { CHAPTERS, type Chapter as ChapterData } from './chapters';

type ChapterProps = Omit<ComponentPropsWithRef<'section'>, 'title'> & {
  chapter: ChapterData;
  /** Stage = the pinned full-viewport frame inside the taller section. */
  stageClassName?: string;
};

/** How much the outgoing stage zooms while the iris opens (the "dive"). */
const IRIS_ZOOM = 0.25;
/** The iris completes within this share of the transition, before the next chapter's text reaches mid-screen. */
const IRIS_SPAN = 0.6;
/** Phones and touch devices get lighter chapter motion; fine pointers on wide screens keep the full iris dive. */
const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse)';
const MOBILE_MOTION_QUERY =
  '(prefers-reduced-motion: no-preference) and (max-width: 767px), (prefers-reduced-motion: no-preference) and (pointer: coarse)';
const DESKTOP_MOTION_QUERY = '(prefers-reduced-motion: no-preference) and (min-width: 768px) and (pointer: fine)';
const irisEase = gsap.parseEase('power1.in'); // opens slowly, then accelerates into the dive

/**
 * One full-screen scene. The outer section is 130-200svh tall (scroll room);
 * the inner stage is sticky and exactly one viewport, so content pins while the scene plays.
 * Hooks for ScrollTrigger: #id, [data-chapter], [data-scene], [data-chapter-stage].
 */
export function Chapter({ chapter, stageClassName, className, children, ref, ...props }: ChapterProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const hasNext = chapter.index < CHAPTERS.length - 1;

  // Portal transition (orientation, santioni-style): when the stage would unpin, it is held centred instead
  // (counter-translated against the scroll) while a white ring opens from the centre and the hole erases this
  // chapter as the stage zooms toward the viewer — we dive through into the next scene, which rises behind it.
  // Runs on the first IRIS_SPAN of the same range as the 3D handoff/camera dive (story-scroll.ts `transition`).
  useGSAP(
    () => {
      const section = sectionRef.current;
      const stage = section?.querySelector<HTMLElement>('[data-chapter-stage]');
      const portal = section?.querySelector<SVGSVGElement>('[data-portal]');
      const circles = portal ? Array.from(portal.querySelectorAll('circle')) : [];
      if (!section || !stage || !portal || !hasNext) return;

      const mm = gsap.matchMedia();
      // Phones / touch: no dive — the iris cut through text and cost frames on mobile GPUs. A short scroll-linked
      // fade-and-lift of the stage hands over to the next scene instead (linear, ≤ DISTANCE_ENTER px, no scale).
      mm.add(MOBILE_MOTION_QUERY, () => {
        // quickSetter, not gsap.set: this runs on every scroll update, and gsap.set built a new tween each time
        // (measured: tween construction + init was the largest JS item of the mobile scroll profile after the render loop)
        const setStageY = gsap.quickSetter(stage, 'y', 'px');
        ScrollTrigger.create({
          trigger: section,
          start: 'bottom bottom',
          end: () => `bottom ${100 - IRIS_SPAN * 100}%`,
          onUpdate: (self) => {
            const p = self.progress;
            stage.style.opacity = p >= 1 ? '0' : String(1 - p);
            setStageY(-DISTANCE_ENTER * p);
          },
        });
        return () => {
          stage.style.opacity = '';
          gsap.set(stage, { clearProps: 'transform' });
        };
      });
      mm.add(DESKTOP_MOTION_QUERY, () => {
        let reach = 0;
        const measure = () => {
          reach = Math.hypot(window.innerWidth, stage.offsetHeight) / 2 + 8;
        };
        const setScale = gsap.quickSetter(stage, 'scale');
        const setStageY = gsap.quickSetter(stage, 'y', 'px');
        const setPortalY = gsap.quickSetter(portal, 'y', 'px');

        const apply = (progress: number, scrolled: number) => {
          // Fully dived through: the iris has erased this chapter. Past the trigger end the stage is no longer
          // counter-translated and drifts off-centre, so the mask's corners would expose stray edges
          // (e.g. the outcome borders peeking into the final CTA on narrow screens). Hide it outright.
          stage.style.opacity = progress >= 1 ? '0' : '';
          if (progress <= 0) {
            stage.classList.remove('is-iris');
            setScale(1);
            setStageY(0);
            setPortalY(0);
            portal.style.opacity = '0';
            return;
          }
          const p = irisEase(progress);
          const scale = 1 + IRIS_ZOOM * p;
          const r = reach * p;
          stage.classList.add('is-iris');
          setScale(scale);
          setStageY(scrolled);
          setPortalY(scrolled);
          // the hole lives in stage-local (pre-scale) px; the ring is outside the stage, in screen px
          stage.style.setProperty('--iris', `${(r / scale).toFixed(1)}px`);
          for (const c of circles) c.setAttribute('r', r.toFixed(1));
          portal.style.opacity = progress < 1 ? String(1 - p * p) : '0';
        };

        ScrollTrigger.create({
          trigger: section,
          start: 'bottom bottom',
          end: () => `bottom ${100 - IRIS_SPAN * 100}%`,
          onUpdate: (self) => apply(self.progress, self.progress * (self.end - self.start)),
          onRefresh: (self) => {
            measure();
            apply(self.progress, self.progress * (self.end - self.start));
          },
        });
        return () => {
          stage.classList.remove('is-iris');
          stage.style.removeProperty('--iris');
          stage.style.opacity = '';
          gsap.set([stage, portal], { clearProps: 'transform' });
          portal.style.opacity = '';
        };
      });
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={mergeRefs(sectionRef, ref)}
      id={chapter.id}
      data-chapter={chapter.index}
      data-scene={chapter.scene}
      aria-labelledby={`${chapter.id}-title`}
      style={{ minHeight: `${chapter.heightVh}svh` }}
      className={cn('relative z-10', className)}
      {...props}
    >
      <div
        data-chapter-stage
        className={cn(
          'sticky top-0 flex h-svh origin-center flex-col justify-center gap-6 px-(--gutter) pt-(--topbar-clearance) pb-(--gutter)',
          stageClassName,
        )}
      >
        {children}
      </div>
      {hasNext && (
        <svg
          data-portal
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-svh w-full overflow-visible text-foreground opacity-0"
        >
          <circle data-halo cx="50%" cy="50%" r="0" fill="none" stroke="currentColor" />
          <circle cx="50%" cy="50%" r="0" fill="none" stroke="currentColor" />
        </svg>
      )}
    </section>
  );
}

type TitleProps = ComponentPropsWithRef<'h2'> & {
  chapter: ChapterData;
  as?: 'h1' | 'h2';
  size?: 'hero' | 'title';
};

/**
 * A text run as word masks of char spans (what SplitText produced with type 'words,chars', mask 'words'). Under
 * reduced motion the masks do not clip (nothing rises out of them), so tight line-height never crops a glyph.
 */
function SplitChars({ text }: { text: string }) {
  const words = text.split(' ');
  return words.map((word, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a static title, never reordered
    <Fragment key={i}>
      {i > 0 ? ' ' : null}
      {word ? (
        <span data-word className="relative inline-block motion-safe:overflow-clip">
          {Array.from(word, (ch, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: chars of a static word
            <span key={k} data-char className="relative inline-block">
              {ch}
            </span>
          ))}
        </span>
      ) : null}
    </Fragment>
  ));
}

export function ChapterTitle({ chapter, as: Tag = 'h2', size = 'title', className, ref, ...props }: TitleProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isIntro = Tag === 'h1';
  const isVisuallyHidden = className?.includes('sr-only') ?? false;

  // Title reveal: chars rise out of a per-word mask, then the emphasis block wipes in (same beat as Caption).
  // h1 assembles on load (hero intro, chars in random order); h2 plays when it scrolls into view and reverses
  // (faster) when you scroll back above it. The <mark> is not split: its inverted background stays one
  // continuous inline box per line (no per-char/per-mask seams), and it is revealed whole by a clip-path wipe.
  useGSAP(
    () => {
      const el = titleRef.current;
      if (!el || isVisuallyHidden) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        // Chars come pre-split from render (SplitChars): SplitText's first char split initialises Intl.Segmenter
        // (ICU), measured ~0.7 s of the mobile-4x boot for the h1 alone, before first paint. The h2 timelines are
        // built in an idle slot (lib/idle.ts) or on approach at the latest; the h1's on load (its intro plays now).
        // Built inside their own context so unmount / media change reverts them like the rest.
        const lazy = gsap.context(() => {});
        let tl: gsap.core.Timeline | null = null;
        const build = () => {
          const chars = el.querySelectorAll<HTMLElement>('[data-char]');
          const marks = el.querySelectorAll('mark');
          primeTransforms(chars);
          const t = gsap.timeline({ paused: !isIntro, delay: isIntro ? INTRO.title : 0 });
          const each = Math.min(STAGGER.char, STAGGER.charSpan / Math.max(1, chars.length - 1));
          // Phones: letters of one word rise together, words stagger — a per-letter cascade reads as jitter on a
          // small screen and costs a tween per glyph.
          const mobile = window.matchMedia(MOBILE_QUERY).matches;
          const words = Array.from(el.querySelectorAll('[data-word]'));
          const wordIndexOf = (target: Element) => {
            const word = target.closest('[data-word]');
            return word ? Math.max(0, words.indexOf(word)) : 0;
          };
          // fromTo, not from: a from-tween re-reads its target's natural transform when it initialises (it reverts
          // its start pose to look), char by char at play time, each read forcing a style recalc mid-scroll. The end
          // pose is known (the chars have no transform of their own), so it is given.
          t.fromTo(
            chars,
            { yPercent: 115 },
            {
              yPercent: 0,
              duration: mobile ? DUR.slow : DUR.slower,
              ease: 'decelerate',
              ...(mobile
                ? { delay: (_i: number, target: Element) => wordIndexOf(target) * STAGGER.item }
                : { stagger: { each, from: isIntro ? 'random' : 'start' } }),
            },
          );
          if (marks.length > 0) {
            t.fromTo(
              marks,
              { clipPath: 'inset(0% 100% 0% 0%)' },
              { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.base, ease: 'standard' },
              '>-0.25',
            );
          }
          tl = t;
        };
        const ensure = () => {
          if (!tl) lazy.add(build);
          return tl;
        };
        if (isIntro) {
          ensure();
          return () => lazy.revert();
        }
        const cancel = whenIdle(ensure);
        ScrollTrigger.create({
          trigger: el,
          start: 'top 85%',
          end: 'max',
          onEnter: () => {
            ensure()?.timeScale(1).play();
          },
          onLeaveBack: () => {
            tl?.timeScale(EXIT_SPEED).reverse();
          },
        });
        return () => {
          cancel();
          lazy.revert();
        };
      });
      mm.add(REDUCED_MOTION_QUERY, () => {
        const fade = gsap.from(el, { opacity: 0, duration: DUR.instant, ease: 'standard', paused: !isIntro });
        if (!isIntro) {
          ScrollTrigger.create({ trigger: el, start: 'top 85%', end: 'max', onEnter: () => fade.play() });
        }
      });
    },
    { scope: titleRef },
  );

  return (
    <Tag
      ref={mergeRefs(titleRef, ref)}
      id={`${chapter.id}-title`}
      aria-label={chapter.title}
      className={cn('font-display font-black uppercase', size === 'hero' ? 'text-hero' : 'text-title', className)}
      {...props}
    >
      {/* the heading is named by aria-label; the per-char spans are presentation only */}
      <span aria-hidden="true">
        <Emphasize text={chapter.title} word={chapter.emphasis} renderText={(run) => <SplitChars text={run} />} />
      </span>
    </Tag>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'w-fit bg-caption px-3 py-2 text-kicker font-semibold uppercase text-caption-foreground backdrop-blur-md',
        className,
      )}
    >
      {children}
    </p>
  );
}
