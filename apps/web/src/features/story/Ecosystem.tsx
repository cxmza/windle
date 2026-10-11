import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { gsap, useGSAP } from '@/lib/gsap';
import { HAND } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY } from '@/lib/use-media-query';
import { CAPTION_LANDED, CAPTION_LEAVING, Caption } from './Caption';
import { Chapter, ChapterTitle, Kicker } from './Chapter';
import { type Chapter as ChapterData, ECOSYSTEM } from './chapters';
import { addDrawOn, playDraw, undraw } from './hand/draw-on';
import { HandDrawing } from './hand/HandDrawing';
import { markLogoSketched, resetLogo } from './hand/logo-sketch';
import { LOGO_SKETCHES } from './hand/strokes';

/** Pause between two logos: the hand travels to the next slot (longer than the lift between strokes of one logo). */
const SLOT_GAP = HAND.gap * 3;

/**
 * Ecosystem chapter: three slots (Solana, pump.fun, X), each a hand-sketched logo above a real label and link.
 *
 * Contract with the 3D layer (details in hand/logo-sketch.ts): `[data-logo-slot="solana|pumpfun|x"]` is the anchor the
 * extruded logo is placed over; `data-logo-state` is sketch -> sketched -> extruded; `story:logo-sketched` fires on the
 * slot when the sketch is finished. The wording claims no partnership; the footnote says so explicitly.
 */
export function Ecosystem({ chapter }: { chapter: ChapterData }) {
  const chapterRef = useRef<HTMLElement>(null);

  // Logo sketches (attention, then continuity into 3D): once the caption has landed the hand sketches each logo,
  // Solana -> pump.fun -> X. As a logo's last stroke lands its slot is marked sketched, which hands it over to the
  // 3D layer (it extrudes the real logo and flips the slot to extruded; CSS cross-fades the sketch out). Scrolling
  // back above the caption undraws faster and passing each handoff point in reverse resets the slot, so the 3D logo
  // retracts. Reduced motion: never built — the finished sketches stay, nothing is dispatched.
  useGSAP(
    () => {
      const stage = chapterRef.current?.querySelector<HTMLElement>('[data-chapter-stage]');
      if (!stage) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        const tl = gsap.timeline({ paused: true });
        let first = true;
        for (const { slot } of ECOSYSTEM) {
          const sketch = stage.querySelector(`[data-logo-sketch="${slot}"]`);
          if (!sketch) continue;
          addDrawOn(tl, sketch, first ? 0 : `>+${SLOT_GAP}`);
          tl.call(() => (tl.reversed() ? resetLogo(slot) : markLogoSketched(slot)));
          first = false;
        }
        const onLanded = () => playDraw(tl);
        const onLeaving = () => undraw(tl);
        stage.addEventListener(CAPTION_LANDED, onLanded);
        stage.addEventListener(CAPTION_LEAVING, onLeaving);
        return () => {
          stage.removeEventListener(CAPTION_LANDED, onLanded);
          stage.removeEventListener(CAPTION_LEAVING, onLeaving);
          for (const { slot } of ECOSYSTEM) resetLogo(slot);
        };
      });
    },
    { scope: chapterRef },
  );

  return (
    <Chapter ref={chapterRef} chapter={chapter} stageClassName="items-center gap-3 text-center sm:gap-6">
      <Kicker>{chapter.kicker}</Kicker>
      <ChapterTitle chapter={chapter} className="max-w-[18ch]" />
      <Caption text={chapter.caption} emphasis={chapter.emphasis} />
      <ul data-ecosystem-slots className="grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
        {ECOSYSTEM.map((item) => (
          <li
            key={item.slot}
            data-ecosystem-item={item.slot}
            className={cn(
              'group relative flex items-center gap-4 border border-border-strong bg-caption p-2 backdrop-blur-md transition-colors duration-(--dur-fast) ease-standard sm:flex-col sm:gap-3 sm:p-4',
              '[@media(hover:hover)]:hover:border-border-accent',
              // the 3D logo renders on the canvas BEHIND this card: once it is extruded, drop the frosted fill from the
              // card (the backdrop blur would smear the logo); the label keeps its own backing below
              'has-[[data-logo-state=extruded]]:bg-transparent has-[[data-logo-state=extruded]]:backdrop-blur-none',
            )}
          >
            {/* Blue halo (feedback: the logo became real): a static shadow-glow layer whose OPACITY blooms in and
                settles once the 3D layer has extruded the logo; fades out again on reset. Reduced motion: no bloom,
                the layer just appears at its settled opacity (the transition is a short fade). */}
            <span
              aria-hidden="true"
              data-logo-glow
              className="pointer-events-none absolute inset-0 opacity-0 shadow-glow transition-opacity duration-(--dur-fast) ease-standard group-has-[[data-logo-state=extruded]]:opacity-60 motion-safe:group-has-[[data-logo-state=extruded]]:animate-glow-settle"
            />
            <div
              data-logo-slot={item.slot}
              data-logo-state="sketch"
              className="group/slot aspect-square w-12 shrink-0 text-ink sm:w-full sm:max-w-32"
            >
              <HandDrawing
                id={`logo-${item.slot}`}
                drawing={LOGO_SKETCHES[item.slot]}
                data-logo-sketch={item.slot}
                className="size-full transition-opacity duration-(--dur-slow) ease-standard group-data-[logo-state=extruded]/slot:opacity-0"
              />
            </div>
            <p className="flex flex-col gap-1 bg-caption px-2 py-1 text-left uppercase backdrop-blur-md sm:items-center sm:text-center">
              <span className="text-kicker font-semibold tracking-[0.18em] text-caption-foreground">{item.prefix}</span>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                data-href-placeholder={item.placeholder || undefined}
                className="inline-flex min-h-6 items-center gap-1 font-display text-lede font-extrabold underline underline-offset-4 transition-colors duration-(--dur-fast) ease-standard active:opacity-70 [@media(hover:hover)]:hover:text-accent-text"
              >
                {item.label}
                <span aria-hidden="true">&#8599;</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </p>
          </li>
        ))}
      </ul>
      <p className="max-w-[52ch] bg-caption px-3 py-2 text-kicker uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-md">
        Independent project. Not affiliated with or endorsed by Solana, pump.fun or X. Logos belong to their owners.
      </p>
    </Chapter>
  );
}
