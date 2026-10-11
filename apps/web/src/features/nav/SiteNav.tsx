import { NavigationMenu } from 'radix-ui';
import { useRef } from 'react';
import { WindleLogo } from '../story/brand/WindleLogo';
import { chapterPath } from '../story/routes';
import { useActiveChapter } from '../story/story-scroll';
import { NavSheet } from './NavSheet';
import { activeProtocolId, DOCS_URL, isProtocolActive, PROTOCOL_ITEMS } from './nav-data';
import { ArrowUpRightGlyph, ChevronDownGlyph } from './nav-icons';
import { LaunchLink, navItemClass, ProtocolRow, SignInLink } from './nav-parts';
import { useNavScroll, useScrollProgressVar } from './nav-scroll';

/** Heavy Unbounded wordmark: folds away with the bar (md+); below md the bar keeps the mark only. */
const wordmarkClass =
  'max-md:sr-only max-w-28 overflow-hidden text-base font-extrabold tracking-[-0.03em] uppercase transition-[max-width,margin,opacity] duration-(--nav-dur) ease-decelerate motion-reduce:transition-none md:group-data-[nav-state=compact]/nav:-ml-2 md:group-data-[nav-state=compact]/nav:max-w-0 md:group-data-[nav-state=compact]/nav:opacity-0';

/**
 * Top bar: the site's only navigation, a floating solid-black block with a 1px hairline (max 1100px, 16px from the top).
 * Scroll states on [data-dock-root][data-nav-state]: full (top; also hover, keyboard focus, open menu) | compact (mark +
 * Launch app, once scrolled past 80px) | hidden (scrolling further down; any scroll up brings the compact bar back).
 * md+: lockup | Protocol menu, Docs, Ecosystem | Sign in, Launch app. Below md: mark | Launch app, Menu button + sheet.
 * Hooks (stable, for motion and tests): [data-dock-root] fixed wrapper (+ data-nav-state),
 * [data-dock] the bar, [data-dock-extras] the links that fold away,
 * [data-header-logo] the lockup link ([data-logo-jelly] on its mark), [data-dock-link=<chapter id>]
 * (aria-current on the active one), [data-dock-protocol] the Protocol trigger, [data-dock-menu] its panel,
 * [data-dock-progress] / [data-dock-progress-fill] (scroll-driven fill; fallback --dock-progress 0..1 on the fill),
 * [data-dock-menu-button], [data-dock-sheet], [data-dock-cta].
 */
export function SiteNav() {
  const { active } = useActiveChapter();
  const activeId = activeProtocolId(active);
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useScrollProgressVar<HTMLSpanElement>();
  useNavScroll(rootRef);

  return (
    <header
      ref={rootRef}
      data-dock-root
      data-nav-state="full"
      className="group/nav pointer-events-none fixed inset-x-0 top-0 z-(--z-dock) px-(--gutter) pt-[calc(var(--nav-offset)+env(safe-area-inset-top,0px))]"
    >
      <div
        data-dock
        className="relative mx-auto h-(--topbar-height) w-full max-w-(--nav-w-full) border border-(--nav-line) bg-background transition-[max-width] duration-(--nav-dur) ease-decelerate motion-reduce:transition-none md:group-data-[nav-state=compact]/nav:max-w-(--nav-w-compact)"
      >
        <div
          data-dock-content
          className="relative flex h-full items-center justify-between gap-2 pr-1.5 pl-4 md:group-data-[nav-state=compact]/nav:overflow-clip"
        >
          <a
            href={chapterPath('hero')}
            data-header-logo
            className="inline-flex shrink-0 items-center py-2 transition-opacity duration-(--dur-instant) ease-standard active:opacity-80 [&_[data-windle-mark]]:text-foreground [@media(hover:hover)]:hover:opacity-90"
          >
            <WindleLogo markSize={20} nudgeKey={active} wordmarkClassName={wordmarkClass} />
            <span className="sr-only">, back to top</span>
          </a>

          <div className="flex min-w-0 items-center gap-1">
            <div data-dock-extras className="hidden md:grid">
              <div className="min-w-0 md:group-data-[nav-state=compact]/nav:overflow-hidden">
                <div className="flex items-center gap-1">
                  <NavigationMenu.Root aria-label="Primary" delayDuration={80} skipDelayDuration={300}>
                    <NavigationMenu.List className="flex items-center">
                      <NavigationMenu.Item className="relative">
                        <NavigationMenu.Trigger
                          data-dock-protocol
                          data-active={isProtocolActive(activeId) ? '' : undefined}
                          className={`${navItemClass} group/trigger`}
                        >
                          Protocol
                          <ChevronDownGlyph className="transition-transform duration-(--dur-fast) ease-standard group-data-[state=open]/trigger:rotate-180 motion-reduce:transition-none" />
                        </NavigationMenu.Trigger>
                        <NavigationMenu.Content
                          data-dock-menu
                          className="absolute top-full left-1/2 -ml-[13.5rem] w-[27rem] max-w-[calc(100vw-2rem)] pt-[calc(0.5rem+1px)]"
                        >
                          <div className="border border-(--nav-line) bg-background">
                            <p className="border-b border-(--nav-line) px-4 py-2.5 font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                              How windle works
                            </p>
                            <ul className="flex flex-col">
                              {PROTOCOL_ITEMS.map((item) => (
                                <li key={item.id} className="border-b border-(--nav-line) last:border-b-0">
                                  <NavigationMenu.Link asChild>
                                    <ProtocolRow item={item} current={item.id === activeId} />
                                  </NavigationMenu.Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </NavigationMenu.Content>
                      </NavigationMenu.Item>

                      <NavigationMenu.Item>
                        <NavigationMenu.Link asChild>
                          <a
                            href={DOCS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-dock-docs
                            className={navItemClass}
                          >
                            Docs
                            <ArrowUpRightGlyph />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        </NavigationMenu.Link>
                      </NavigationMenu.Item>

                      <NavigationMenu.Item>
                        <NavigationMenu.Link asChild>
                          <a
                            href={chapterPath('ecosystem')}
                            data-dock-link="ecosystem"
                            aria-current={activeId === 'ecosystem' ? 'location' : undefined}
                            className={navItemClass}
                          >
                            Ecosystem
                          </a>
                        </NavigationMenu.Link>
                      </NavigationMenu.Item>
                    </NavigationMenu.List>
                  </NavigationMenu.Root>
                  <SignInLink />
                </div>
              </div>
            </div>
            <LaunchLink />
            <NavSheet activeId={activeId} />
          </div>
        </div>

        {/* scroll progress: a 2px blue line along the bar's bottom edge, inside the border */}
        <span
          data-dock-progress
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
        >
          {/* fill: scroll-driven where supported, else follows --dock-progress (globals.css) */}
          <span
            ref={progressRef}
            data-dock-progress-fill
            className="block h-full origin-left bg-accent [transform:scaleX(var(--dock-progress,0))]"
          />
        </span>
      </div>
    </header>
  );
}
