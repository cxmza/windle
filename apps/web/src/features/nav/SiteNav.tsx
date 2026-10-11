import { NavigationMenu } from 'radix-ui';
import { useState } from 'react';
import { WindleLogo } from '../story/brand/WindleLogo';
import { chapterPath } from '../story/routes';
import { useActiveChapter } from '../story/story-scroll';
import { GlassIsland } from './GlassIsland';
import { NavSheet } from './NavSheet';
import { useNavBubble } from './nav-bubble';
import { activeProtocolId, DOCS_URL, isProtocolActive, PROTOCOL_ITEMS } from './nav-data';
import { ArrowUpRightGlyph, ChevronDownGlyph } from './nav-icons';
import { LaunchLink, navItemClass, ProtocolRow, SignInLink } from './nav-parts';

const wordmarkClass = 'text-base font-extrabold tracking-[-0.03em] uppercase max-lg:md:sr-only';

/**
 * Top bar as three islands at a fixed size and position (nothing collapses on scroll): the lockup sits straight on the
 * page, a glass capsule in the middle holds Protocol (menu), Docs and Ecosystem, a second glass island on the right holds
 * Sign in and Launch app. Below md the capsule is gone and the right island holds Launch app and the menu button + sheet.
 * Hooks (stable, for motion and tests): [data-dock-root] fixed wrapper, [data-dock-island] every glass island
 * ([data-dock] the centre capsule, [data-dock-actions] the right one; [data-glass] its glass layer), [data-dock-bubble]
 * the sliding hover bubble, [data-header-logo] the lockup link ([data-logo-jelly] on its mark), [data-dock-link=<chapter
 * id>] (aria-current on the active one), [data-dock-protocol] the Protocol trigger, [data-dock-menu] its panel,
 * [data-dock-menu-button], [data-dock-sheet], [data-dock-signin], [data-dock-cta].
 */
export function SiteNav() {
  const { active } = useActiveChapter();
  const activeId = activeProtocolId(active);
  const [openValue, setOpenValue] = useState('');
  const { rootRef, bubbleRef, handlers } = useNavBubble<HTMLElement>(`${activeId}|${openValue}`);

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
          <NavigationMenu.Root
            ref={rootRef}
            aria-label="Primary"
            delayDuration={80}
            skipDelayDuration={300}
            onValueChange={setOpenValue}
            className="relative"
            {...handlers}
          >
            <span ref={bubbleRef} data-dock-bubble aria-hidden="true" />
            <NavigationMenu.List className="flex items-center">
              <NavigationMenu.Item>
                <NavigationMenu.Trigger
                  data-dock-item
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

        <GlassIsland data-dock-actions className="flex h-full items-center gap-1 justify-self-end p-1.5">
          <SignInLink className="max-md:hidden" />
          <LaunchLink />
          <NavSheet activeId={activeId} />
        </GlassIsland>
      </div>
    </header>
  );
}
