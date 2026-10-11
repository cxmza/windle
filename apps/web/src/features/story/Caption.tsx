import { type ComponentPropsWithRef, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';
import { gsap, loadSplitText, primeTransforms, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { whenIdle } from '@/lib/idle';
import { mergeRefs } from '@/lib/merge-refs';
import { DUR, EXIT_SPEED, STAGGER } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY, REDUCED_MOTION_QUERY } from '@/lib/use-media-query';

/**
 * Wraps the first case-insensitive occurrence of `word` in an inverted <mark>. `renderText` renders the plain runs
 * around it (ChapterTitle pre-splits them into chars); the mark itself is never split.
 */
export function Emphasize({
  text,
  word,
  renderText = (run) => run,
}: {
  text: string;
  word: string | null;
  renderText?: (run: string) => ReactNode;
}): ReactNode {
  const at = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (!word || at === -1) return renderText(text);
  return (
    <>
      {renderText(text.slice(0, at))}
      <mark data-emphasis className="box-decoration-clone bg-emphasis px-[0.3em] py-[0.05em] text-emphasis-foreground">
        {text.slice(at, at + word.length)}
      </mark>
      {renderText(text.slice(at + word.length))}
    </>
  );
}

type CaptionProps = ComponentPropsWithRef<'p'> & {
  text: string;
  emphasis?: string | null;
};

const REVEAL_START = 'top 85%';

/**
 * Bubbling DOM events a Caption fires on itself so siblings (hand-drawn annotations) can sync to it without
 * sharing its timeline: LANDED when the reveal (incl. the emphasis wipe) has finished, LEAVING when it starts to
 * reverse on scroll back. Only fired with motion allowed; reduced motion shows everything at once.
 */
export const CAPTION_LANDED = 'story:caption-landed';
export const CAPTION_LEAVING = 'story:caption-leaving';

const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));

/** Comic-style narration box: bordered, uppercase, solid/blurred backing for AA over the 3D canvas. */
export function Caption({ text, emphasis = null, className, ref, ...props }: CaptionProps) {
  const boxRef = useRef<HTMLParagraphElement>(null);

  // Comic narration reveal: the box wipes open from its nearest top corner, lines rise one by one,
  // the emphasis block wipes in last. Reverses faster when scrolled back above.
  useGSAP(
    () => {
      const box = boxRef.current;
      if (!box) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        let tl: gsap.core.Timeline | null = null;
        /** Last scroll intent: 1 = revealed, -1 = scrolled back above, 0 = not reached yet. */
        let direction: -1 | 0 | 1 = 0;
        // The split (and the layout read for the wipe corner) is deferred to an idle slot, or to the reveal at the
        // latest: every caption splitting in the first commit was boot work before first paint (see ChapterTitle).
        const lazy = gsap.context(() => {});
        let built = false;
        let alive = true;
        const build = (SplitText: Awaited<ReturnType<typeof loadSplitText>>) => {
          const rect = box.getBoundingClientRect();
          const fromRight = rect.left + rect.width / 2 > window.innerWidth / 2;
          const closed = fromRight ? 'inset(0% 0% 100% 100%)' : 'inset(0% 100% 100% 0%)';
          // aria 'none': lines never break words, so the paragraph stays readable to screen readers as is.
          SplitText.create(box, {
            type: 'lines',
            mask: 'lines',
            aria: 'none',
            autoSplit: true,
            onSplit: (self) => {
              const marks = box.querySelectorAll('mark');
              const progress = tl?.progress() ?? 0;
              primeTransforms(self.lines);
              tl = gsap
                .timeline({ paused: true, onComplete: () => fire(box, CAPTION_LANDED) })
                .fromTo(
                  box,
                  { clipPath: closed },
                  { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.slow, ease: 'decelerate' },
                )
                // fromTo (known end pose): see ChapterTitle — a from-tween re-reads computed style per line on play
                .fromTo(
                  self.lines,
                  { yPercent: 100 },
                  { yPercent: 0, duration: DUR.base, ease: 'decelerate', stagger: STAGGER.line },
                  '<0.2',
                );
              if (marks.length > 0) {
                tl.fromTo(
                  marks,
                  { clipPath: 'inset(0% 100% 0% 0%)' },
                  { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.base, ease: 'standard' },
                  '>-0.05',
                );
              }
              tl.progress(progress);
              // a re-split (fonts loading, resize) mid-reveal must keep the reveal going, not freeze it half-open
              if (direction === 1) tl.timeScale(1).play();
              else if (direction === -1) tl.timeScale(EXIT_SPEED).reverse();
              return tl;
            },
          });
        };
        // SplitText is a lazy chunk (lib/gsap.ts): the build runs when it has arrived
        const ensure = () => {
          if (built) return;
          built = true;
          void loadSplitText().then((SplitText) => {
            if (alive) lazy.add(() => build(SplitText));
          });
        };
        const cancel = whenIdle(ensure);
        ScrollTrigger.create({
          trigger: box,
          start: REVEAL_START,
          end: 'max',
          onEnter: () => {
            direction = 1;
            // not built yet (reader got here first): onSplit starts the reveal itself, as direction === 1
            ensure();
            tl?.timeScale(1).play();
          },
          onLeaveBack: () => {
            direction = -1;
            tl?.timeScale(EXIT_SPEED).reverse();
            fire(box, CAPTION_LEAVING);
          },
        });
        return () => {
          alive = false;
          cancel();
          lazy.revert();
        };
      });
      mm.add(REDUCED_MOTION_QUERY, () => {
        const fade = gsap.from(box, { opacity: 0, duration: DUR.instant, ease: 'standard', paused: true });
        ScrollTrigger.create({ trigger: box, start: REVEAL_START, end: 'max', onEnter: () => fade.play() });
      });
    },
    { scope: boxRef },
  );

  return (
    <p
      ref={mergeRefs(boxRef, ref)}
      data-caption
      className={cn(
        'max-w-[34ch] border border-border-strong bg-caption p-4 text-lede font-medium uppercase text-caption-foreground backdrop-blur-md',
        className,
      )}
      {...props}
    >
      <Emphasize text={text} word={emphasis} />
    </p>
  );
}
