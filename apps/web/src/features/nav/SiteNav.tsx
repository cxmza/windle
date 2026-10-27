import { NavigationMenu } from 'radix-ui';
import { WindleLogo } from '../story/brand/WindleLogo';
import { chapterPath } from '../story/routes';
import { useActiveChapter } from '../story/story-scroll';
import { DockSocials } from './DockSocials';
import { GlassIsland } from './GlassIsland';
import { NavSheet } from './NavSheet';
import { useNavBubble } from './nav-bubble';
import { activeProtocolId, DOCS_URL, isProtocolActive, PROTOCOL_TARGET } from './nav-data';
import { ArrowUpRightGlyph } from './nav-icons';
import { LaunchLink, navItemClass, SignInLink } from './nav-parts';

const wordmarkClass = 'text-base font-extrabold tracking-[-0.03em] uppercase max-lg:md:sr-only';

/**
 * Top bar as three islands at a fixed size and position (nothing collapses on scroll): the lockup sits straight on the
 * page, a glass capsule in the middle holds Protocol (link to chapter 01), Docs and Ecosystem, a second glass island on the right holds
 * Sign in and Launch app; beside it a third island holds the social icons (DockSocials, which also holds the token CA chip). Below md the capsule is gone and the right island holds Launch app and the menu button + sheet.
 * Hooks (stable, for motion and tests): [data-dock-root] fixed wrapper, [data-dock-island] every glass island
 * ([data-dock] the centre capsule, [data-dock-actions] the right one; [data-glass] its glass layer), [data-dock-bubble]
 * the sliding hover bubble, [data-header-logo] the lockup link ([data-logo-jelly] on its mark), [data-dock-link=<chapter
 * id>] (aria-current on the active one), [data-dock-protocol] the Protocol link,
 * [data-dock-menu-button], [data-dock-sheet], [data-dock-signin], [data-dock-cta].
 */
export function SiteNav() {
  const { active } = useActiveChapter();
  const activeId = activeProtocolId(active);
  const { rootRef, bubbleRef, handlers } = useNavBubble<HTMLElement>(`${activeId}`);

  return (
    <header
      data-dock-root
      className="pointer-events-none fixed inset-x-0 top-0 z-(--z-dock) px-(--gutter) pt-[calc(var(--nav-offset)+env(safe-area-inset-top,0px))]"
    >
      <div className="mx-auto flex h-(--topbar-height) w-full max-w-(--page-max) items-center justify-between md:grid md:grid-cols-[auto_1fr_auto] lg:grid-cols-[1fr_auto_1fr]">
        <a
          href={chapterPath('hero')}
          data-header-logo
          className="pointer-events-auto inline-flex shrink-0 items-center justify-self-start py-2 transition-opacity duration-(--dur-instant) ease-standard active:opacity-80 [&_[data-windle-mark]]:text-foreground [@media(hover:hover)]:hover:opacity-90"
        >
          <WindleLogo markSize={22} nudgeKey={active} wordmarkClassName={wordmarkClass} />
          <span className="sr-only">, back to top</span>
        </a>

        <GlassIsland data-dock className="hidden h-full items-center justify-self-center p-1.5 md:flex">
          <NavigationMenu.Root ref={rootRef} aria-label="Primary" className="relative" {...handlers}>
            <span ref={bubbleRef} data-dock-bubble aria-hidden="true" />
            <NavigationMenu.List className="flex items-center">
              <NavigationMenu.Item>
                <NavigationMenu.Link asChild>
                  <a
                    href={chapterPath(PROTOCOL_TARGET)}
                    data-dock-item
                    data-dock-protocol
                    data-active={isProtocolActive(activeId) ? '' : undefined}
                    className={navItemClass}
                  >
                    Protocol
                  </a>
                </NavigationMenu.Link>
              </NavigationMenu.Item>

              <NavigationMenu.Item>
                <NavigationMenu.Link asChild>
                  <a
                    href={DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-dock-item
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
                    data-dock-item
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
        </GlassIsland>

        <div className="relative flex h-full items-center justify-self-end gap-2">
          <DockSocials />
          <GlassIsland data-dock-actions className="flex h-full items-center gap-1 p-1.5">
            <SignInLink className="max-md:hidden" />
            <LaunchLink />
            <NavSheet activeId={activeId} />
          </GlassIsland>
        </div>
      </div>
    </header>
  );
}
