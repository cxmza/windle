import { type ComponentPropsWithRef, useRef } from 'react';
import { cn } from '@/lib/cn';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { mergeRefs } from '@/lib/merge-refs';
import { STAGGER } from '@/lib/motion-tokens';
import { NO_MOTION_PREF_QUERY } from '@/lib/use-media-query';
import { drawOn, playDraw, undraw } from './hand/draw-on';
import { HandDrawing } from './hand/HandDrawing';
import { GLYPHS } from './hand/strokes';

export const CHECKS = [
  { id: 'deployed', label: 'Program deployed' },
  { id: 'vesting', label: 'Vesting untouched' },
  { id: 'revenue', label: 'Revenue ≥ N' },
] as const;

export type CheckId = (typeof CHECKS)[number]['id'];
export type CheckState = 'pending' | 'pass' | 'fail';

/**
 * Resolved example shown by default (and under reduced motion): two pass, one fail. Scroll-driven motion is
 * expected to start every slot at 'pending' and advance them by writing `data-state` on the items, or by
 * passing `states`.
 */
export const EXAMPLE_STATES = {
  deployed: 'pass',
  vesting: 'pass',
  revenue: 'fail',
} as const satisfies Record<CheckId, CheckState>;

const STATE_TEXT = { pending: 'pending', pass: 'passed', fail: 'failed' } as const satisfies Record<CheckState, string>;

type ChecklistProps = Omit<ComponentPropsWithRef<'ul'>, 'children'> & {
  states?: Record<CheckId, CheckState>;
};

/**
 * Share of the judge chapter's pinned hold (`top top` -> `bottom bottom`) at which each check resolves, in list
 * order. Spread over the first half so all three are in before the portal transition starts.
 */
const RESOLVE_AT = [0.08, 0.24, 0.4] as const;

const GLYPH_BASE = 'absolute inset-0 size-full text-ink transition-opacity duration-(--dur-fast) ease-standard';

/**
 * Onchain checks with hand-drawn slots. Each `<li data-checklist-item=<id> data-state=pending|pass|fail>` stacks
 * a box, a check and a cross; CSS shows the one that matches `data-state` (box always, check on pass, cross on
 * fail). Status is also real text (sr-only) so colour/shape is never the only carrier.
 */
export function Checklist({ states = EXAMPLE_STATES, className, ref, ...props }: ChecklistProps) {
  const resolved = CHECKS.filter((c) => states[c.id] !== 'pending').length;
  const listRef = useRef<HTMLUListElement>(null);

  // Being judged (attention + feedback): the empty boxes are sketched as the list scrolls in, then, as the pinned
  // judge chapter scrolls on, each slot flips from pending to its verdict and the check/cross is drawn in.
  // Scrolling back undraws (faster) and returns the slot to pending. The visual slot starts at pending; the
  // sr-only status text keeps the resolved verdict (the animation is a re-enactment, not new information).
  // Reduced motion: nothing runs, the resolved example is shown as rendered.
  useGSAP(
    () => {
      const list = listRef.current;
      const section = list?.closest<HTMLElement>('[data-chapter]');
      if (!list || !section) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF_QUERY, () => {
        const items = [...list.querySelectorAll<HTMLElement>('[data-checklist-item]')];
        const finals = items.map((item) => item.dataset.state ?? 'pending');
        const finalResolved = list.dataset.resolved ?? '';
        const boxes = drawOn(list.querySelectorAll('[data-glyph=box]'));
        // stagger the boxes like a hand going down the list
        boxes.getChildren(false).forEach((child, i) => {
          child.startTime(i * STAGGER.item * 2);
        });

        let shown = 0;
        const verdicts = items.map((item, i) => {
          const glyph = item.querySelector(finals[i] === 'fail' ? '[data-glyph=cross]' : '[data-glyph=check]');
          const tl = drawOn(glyph ? [glyph] : []);
          tl.eventCallback('onReverseComplete', () => {
            item.dataset.state = 'pending';
          });
          return tl;
        });
        const setResolved = (count: number) => {
          if (count === shown) return;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const tl = verdicts[i];
            if (!item || !tl) continue;
            if (i < count && i >= shown) {
              item.dataset.state = finals[i];
              playDraw(tl);
            } else if (i >= count && i < shown) {
              undraw(tl);
            }
          }
          shown = count;
          list.dataset.resolved = String(count);
        };
        for (const item of items) item.dataset.state = 'pending';
        list.dataset.resolved = '0';

        ScrollTrigger.create({
          trigger: list,
          start: 'top 85%',
          end: 'max',
          onEnter: () => playDraw(boxes),
          onLeaveBack: () => undraw(boxes),
        });
        ScrollTrigger.create({
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => setResolved(RESOLVE_AT.filter((at) => self.progress >= at).length),
          onRefresh: (self) => setResolved(RESOLVE_AT.filter((at) => self.progress >= at).length),
        });
        return () => {
          items.forEach((item, i) => {
            item.dataset.state = finals[i];
          });
          list.dataset.resolved = finalResolved;
        };
      });
    },
    { scope: listRef },
  );

  return (
    <ul
      ref={mergeRefs(listRef, ref)}
      aria-label="Onchain checks"
      data-checklist
      data-resolved={resolved}
      className={cn('flex flex-col gap-1', className)}
      {...props}
    >
      {CHECKS.map(({ id, label }) => (
        <li
          key={id}
          data-checklist-item={id}
          data-state={states[id]}
          className="group/item flex min-h-8 items-center gap-3 text-caption font-semibold text-foreground uppercase tracking-[0.06em]"
        >
          <span data-check-slot className="relative size-7 shrink-0">
            <HandDrawing id={`check-${id}-box`} drawing={GLYPHS.box} data-glyph="box" className={GLYPH_BASE} />
            <HandDrawing
              id={`check-${id}-pass`}
              drawing={GLYPHS.check}
              data-glyph="check"
              className={cn(GLYPH_BASE, 'opacity-0 group-data-[state=pass]/item:opacity-100')}
            />
            <HandDrawing
              id={`check-${id}-fail`}
              drawing={GLYPHS.cross}
              data-glyph="cross"
              className={cn(GLYPH_BASE, 'opacity-0 group-data-[state=fail]/item:opacity-100')}
            />
          </span>
          <span>
            {label}
            <span className="sr-only">: {STATE_TEXT[states[id]]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
