import { WindleMark } from '@windle/brand';
import { useRef } from 'react';
import { GitHubGlyph, XGlyph } from '../nav/nav-icons';
import { useLogoJelly } from '../story/brand/use-jelly';
import { chapterPath } from '../story/routes';
import { DISCLAIMER, FOOTER_COLUMNS, HEALTH_URL, LEGAL_LINKS, SOCIALS, TAGLINE } from './footer-links';
import { StatusPill } from './StatusPill';
import { useApiHealth } from './use-api-health';

const linkClass =
  'inline-flex min-h-8 items-center rounded-sm text-sm text-foreground/75 transition-colors duration-(--dur-fast) ease-standard active:text-foreground [@media(hover:hover)]:hover:text-foreground';

const GLYPHS = { x: XGlyph, github: GitHubGlyph } as const;

/**
 * Information footer after the final CTA chapter. Hooks: [data-site-footer], [data-footer-mark] (the draggable mark in
 * the lockup, [data-logo-jelly]), [data-api-status] on the status pill, [data-footer-x] on the social buttons.
 * The mark reuses the logo jelly (brand/use-jelly.ts): drag it, it stretches and springs back; static under reduced
 * motion. The oversized wordmark at the bottom is decoration only.
 */
export function SiteFooter({ fetchFn }: { fetchFn?: typeof fetch }) {
  const ref = useRef<HTMLElement>(null);
  const health = useApiHealth(ref, HEALTH_URL, fetchFn);
  const markRef = useLogoJelly<SVGSVGElement>();
  return (
    <footer
      ref={ref}
      data-site-footer
      className="relative z-10 overflow-hidden border-t border-border/50 bg-background"
    >
      <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-12 px-(--gutter) pt-14 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="flex min-w-0 flex-col items-start gap-5">
            <div className="flex items-center gap-2.5">
              <span title="Drag me" className="inline-flex">
                <WindleMark ref={markRef} data-footer-mark data-logo-jelly decorative size={32} />
              </span>
              <a
                href={chapterPath('hero')}
                className="rounded-md py-1 font-display text-lg leading-none font-black tracking-tight text-foreground lowercase"
              >
                windle
              </a>
            </div>
            <p className="max-w-[36ch] text-sm leading-relaxed text-pretty text-muted-foreground">{TAGLINE}</p>
            <StatusPill health={health} />
            <ul className="flex items-center gap-2">
              {SOCIALS.flatMap((social) => {
                if (!social.href) return [];
                const Glyph = GLYPHS[social.slot];
                return [
                  <li key={social.slot}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-footer-x={social.slot === 'x' ? '' : undefined}
                      data-href-placeholder={social.placeholder || undefined}
                      aria-label={`windle on ${social.label} (opens in a new tab)`}
                      className="inline-flex size-9 items-center justify-center rounded-md border border-border/60 text-foreground/75 transition-colors duration-(--dur-fast) ease-standard active:bg-foreground/10 [@media(hover:hover)]:hover:bg-foreground/5 [@media(hover:hover)]:hover:text-foreground"
                    >
                      <Glyph width={16} height={16} />
                    </a>
                  </li>,
                ];
              })}
            </ul>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title} className="flex min-w-0 flex-col gap-3">
                <p
                  id={`footer-${column.title}`}
                  className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase"
                >
                  {column.title}
                </p>
                <ul aria-labelledby={`footer-${column.title}`} className="flex flex-col">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className={linkClass}
                        {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {link.label}
                        {link.external && <span className="sr-only"> (opens in a new tab)</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/50 pt-6 text-[0.8125rem] text-muted-foreground">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="tabular-nums">© 2026 windle</p>
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center rounded-sm transition-colors duration-(--dur-fast) ease-standard active:text-foreground [@media(hover:hover)]:hover:text-foreground"
                  >
                    {link.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="max-w-[72ch] text-pretty">{DISCLAIMER}</p>
        </div>
      </div>

      {/* decorative backdrop: an oversized wordmark, faint and cut off by the bottom edge */}
      <div aria-hidden="true" className="pointer-events-none relative mt-6 h-[10.5vw] overflow-hidden select-none">
        <span className="absolute inset-x-0 top-0 block bg-linear-to-b from-foreground/20 via-accent-text/15 to-transparent bg-clip-text text-center font-display text-[20vw] leading-none font-black tracking-tighter text-transparent lowercase">
          windle
        </span>
      </div>
    </footer>
  );
}
