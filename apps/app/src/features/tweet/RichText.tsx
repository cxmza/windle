import type { XUrlEntity } from '@windle/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/media';
import { cssDuration, cssEasing } from '@/lib/motion';
import { safeHref } from '../predict/ui/linkify';
import { tokenizeRich } from './rich-text';

const LINK =
  'text-accent-text underline decoration-transparent underline-offset-2 transition-colors duration-(--dur-instant) active:opacity-80 [@media(hover:hover)]:hover:decoration-current';

const LANG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const languageOf = (lang: string | null | undefined): string | undefined =>
  lang && LANG.test(lang) && lang !== 'und' ? lang : undefined;

type Props = {
  text: string;
  urls?: readonly XUrlEntity[] | undefined;
  lang?: string | null | undefined;
  hasAttachment?: boolean;
  /** Plain text, clamped to this many lines with no way to expand: for text drawn inside another link. */
  plainLines?: 4 | 6;
  className?: string;
};

/**
 * The text of a post: t.co links shown as their real address, mentions, hashtags and cashtags linked to x.com, line
 * breaks kept, the writing direction taken from the text itself. Text taller than eight lines is clamped behind "Show more".
 */
export function RichText({ text, urls, lang, hasAttachment = false, plainLines, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const plain = plainLines !== undefined;
  const clamp = plain || !open;
  const language = languageOf(lang);
  const reduced = useReducedMotion();
  const textRef = useRef<HTMLParagraphElement>(null);
  const from = useRef<number | null>(null);
  const running = useRef<Animation | null>(null);

  // Whether the clamp actually hides something is a question for the layout, not for the character count.
  // biome-ignore lint/correctness/useExhaustiveDependencies: new text changes what the clamp hides
  useLayoutEffect(() => {
    const p = textRef.current;
    if (!p || plain || open) return;
    const measure = () => setOverflowing(p.scrollHeight > p.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(p);
    return () => ro.disconnect();
  }, [open, plain, text]);

  const toggle = () => {
    const p = textRef.current;
    from.current = p && !reduced ? p.getBoundingClientRect().height : null;
    setOpen((v) => !v);
  };

  // The clamp switches in one render; the box then eases from the height it had (mid-ease included) to the new one.
  // While it eases the text is unclamped and clipped ([data-sizing]), so closing reads as a curtain, not a cut.
  useLayoutEffect(() => {
    const p = textRef.current;
    const start = from.current;
    from.current = null;
    if (!p || start === null || typeof p.animate !== 'function') return;
    running.current?.cancel();
    delete p.dataset.sizing;
    const end = p.getBoundingClientRect().height;
    if (Math.abs(end - start) < 1) return;
    p.dataset.sizing = '';
    const anim = p.animate([{ height: `${start}px` }, { height: `${end}px` }], {
      duration: open ? cssDuration('--dur-base', 260) : cssDuration('--dur-fast', 180),
      easing: open
        ? cssEasing('--ease-decelerate', 'cubic-bezier(0.05, 0.7, 0.1, 1)')
        : cssEasing('--ease-standard', 'cubic-bezier(0.2, 0, 0, 1)'),
    });
    running.current = anim;
    const done = () => {
      if (running.current !== anim) return;
      running.current = null;
      delete p.dataset.sizing;
    };
    anim.finished.then(done, done);
  }, [open]);

  useEffect(() => () => running.current?.cancel(), []);

  return (
    <div className={className}>
      <p
        ref={textRef}
        data-tweet-text
        dir="auto"
        {...(language ? { lang: language } : {})}
        className={`text-sm leading-[1.35rem] break-words whitespace-pre-wrap text-foreground ${clamp ? (plainLines === 4 ? 'line-clamp-4' : plainLines === 6 ? 'line-clamp-6' : 'line-clamp-8') : ''}`}
      >
        {plain
          ? text
          : tokenizeRich(text, urls, hasAttachment).map((t) =>
              t.kind === 'text' ? (
                <span key={t.at}>{t.text}</span>
              ) : (
                <a
                  key={t.at}
                  href={safeHref(t.href) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className={`${LINK} ${t.type === 'url' ? 'break-all' : ''}`}
                >
                  {t.text}
                </a>
              ),
            )}
      </p>
      {!plain && (open || overflowing) ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="mt-0.5 inline-flex min-h-6 items-center text-xs font-medium text-accent-text underline-offset-2 transition-colors duration-(--dur-instant) active:opacity-80 [@media(hover:hover)]:hover:underline"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}
