import { NavigationMenu } from 'radix-ui';
import { WindleLogo } from '../story/brand/WindleLogo';
import { chapterPath } from '../story/routes';
import { useActiveChapter } from '../story/story-scroll';
import { LiquidGlassDefs } from './LiquidGlassDefs';
import { NavSheet } from './NavSheet';
import { activeProtocolId, DOCS_URL, isProtocolActive, PROTOCOL_ITEMS } from './nav-data';
import { ArrowUpRightGlyph, ChevronDownGlyph } from './nav-icons';
import { LaunchLink, navItemClass, ProtocolRow, SignInLink } from './nav-parts';
import { useScrollProgressVar } from './nav-scroll';

const wordmarkClass = 'max-md:sr-only text-base font-extrabold tracking-[-0.03em] uppercase';

/**
 * Top bar: the site's only navigation, a floating liquid-glass pill (max 1100px, 16px from the top). One size and shape at
 * every scroll position. md+: lockup | Protocol menu, Docs, Ecosystem | Sign in, Launch app. Below md: mark | Launch app,
 * Menu button + sheet.
 * Hooks (stable, for motion and tests): [data-dock-root] fixed wrapper, [data-dock] the bar ([data-dock-glass] its backdrop layer), [data-dock-extras] the md+ links, [data-header-logo] the lockup link ([data-logo-jelly] on its
 * mark), [data-dock-link=<chapter id>] (aria-current on the active one), [data-dock-protocol] the Protocol trigger,
 * [data-dock-menu] its panel, [data-dock-progress] / [data-dock-progress-fill] (scroll-driven fill; fallback
 * --dock-progress 0..1 on the fill), [data-dock-menu-button], [data-dock-sheet], [data-dock-cta].
 */
export function SiteNav() {
  const { active } = useActiveChapter();
  const activeId = activeProtocolId(active);
  const progressRef = useScrollProgressVar<HTMLSpanElement>();

  return (
    <header
      data-dock-root
      className="pointer-events-none fixed inset-x-0 top-0 z-(--z-dock) px-(--gutter) pt-[calc(var(--nav-offset)+env(safe-area-inset-top,0px))]"
    >
      <div data-dock className="relative mx-auto h-(--topbar-height) w-full max-w-(--nav-w-full) rounded-full">
        <LiquidGlassDefs />
        <span data-dock-glass aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full" />
        <div data-dock-content className="relative flex h-full items-center justify-between gap-2 pr-2 pl-5">
          <a
            href={chapterPath('hero')}
            data-header-logo
            className="inline-flex shrink-0 items-center py-2 transition-opacity duration-(--dur-instant) ease-standard active:opacity-80 [&_[data-windle-mark]]:text-foreground [@media(hover:hover)]:hover:opacity-90"
          >
            <WindleLogo markSize={20} nudgeKey={active} wordmarkClassName={wordmarkClass} />
            <span className="sr-only">, back to top</span>
          </a>

          <div className="flex min-w-0 items-center gap-1">
            <div data-dock-extras className="hidden md:block">
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
                        className="absolute top-full left-1/2 -ml-[13.5rem] w-[27rem] max-w-[calc(100vw-2rem)] pt-3"
                      >
                        <div className="overflow-hidden p-2">
                          <p className="px-3 pt-2 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                            How windle works
                          </p>
                          <ul className="flex flex-col gap-0.5">
                            {PROTOCOL_ITEMS.map((item) => (
                              <li key={item.id}>
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
            <LaunchLink />
            <NavSheet activeId={activeId} />
          </div>
        </div>

        {/* scroll progress: a 2px blue line along the pill's bottom edge, inset from the curve */}
        <span
          data-dock-progress
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-7 bottom-px h-0.5 overflow-hidden rounded-full"
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
