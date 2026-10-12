import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { useMediaQuery } from '@/lib/use-media-query';
import { WindleLogo } from '../story/brand/WindleLogo';
import type { ChapterKey } from '../story/chapters';
import { chapterPath } from '../story/routes';
import { DOCS_URL, isProtocolActive, PROTOCOL_TARGET, SIGN_IN_URL, X_LINK } from './nav-data';
import { ArrowUpRightGlyph, CloseGlyph, MenuGlyph, XGlyph } from './nav-icons';
import { LaunchLink } from './nav-parts';

const DESKTOP_QUERY = '(min-width: 48rem)'; // Tailwind `md`

const barButton =
  'dock-item inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none';
const plainRow =
  'dock-row flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 text-base font-medium tracking-(--nav-tracking) text-foreground transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none';

/** < md: the menu button in the bar and the full-height sheet that drops from the top (Radix Dialog: focus trap, Esc, scroll lock, focus return). */
export function NavSheet({ activeId }: { activeId: ChapterKey | null }) {
  const [requested, setRequested] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // derived: growing past md while open closes the sheet instead of leaving a hidden modal behind
  const open = requested && !isDesktop;
  const close = () => setRequested(false);
  return (
    <Dialog.Root open={open} onOpenChange={setRequested}>
      <Dialog.Trigger asChild>
        <button type="button" data-dock-menu-button aria-label="Open menu" className={`${barButton} md:hidden`}>
          <MenuGlyph />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        {/* motion: keyframes on data-state in globals.css (Radix Presence waits for the exit animation) */}
        <Dialog.Content
          ref={sheetRef}
          data-dock-sheet
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // land on the sheet itself (no ring flashing on a control); Tab then enters the trapped list
            event.preventDefault();
            sheetRef.current?.focus();
          }}
          className="fixed inset-0 z-(--z-sheet) flex flex-col pt-[env(safe-area-inset-top,0px)] outline-none md:hidden"
        >
          <div className="flex h-[calc(var(--topbar-height)+var(--nav-offset))] shrink-0 items-center justify-between px-(--gutter) pt-(--nav-offset)">
            <a
              href={chapterPath('hero')}
              onClick={close}
              className="inline-flex items-center py-2 [&_[data-windle-mark]]:text-foreground"
            >
              <WindleLogo markSize={22} wordmarkClassName="text-base font-extrabold tracking-[-0.03em] uppercase" />
              <span className="sr-only">, back to top</span>
            </a>
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close menu" className={barButton}>
                <CloseGlyph />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-(--gutter) py-4">
            <ul className="flex flex-col gap-0.5">
              <li>
                <a
                  href={chapterPath(PROTOCOL_TARGET)}
                  data-dock-protocol
                  data-active={isProtocolActive(activeId) ? '' : undefined}
                  onClick={close}
                  className={plainRow}
                >
                  Protocol
                </a>
              </li>
              <li>
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={plainRow}>
                  <span>
                    Docs<span className="sr-only"> (opens in a new tab)</span>
                  </span>
                  <ArrowUpRightGlyph className="text-muted-foreground" />
                </a>
              </li>
              <li>
                <a
                  href={chapterPath('ecosystem')}
                  data-dock-link="ecosystem"
                  aria-current={activeId === 'ecosystem' ? 'location' : undefined}
                  onClick={close}
                  className={plainRow}
                >
                  Ecosystem
                </a>
              </li>
              <li>
                <a href={SIGN_IN_URL} className={plainRow}>
                  Sign in
                </a>
              </li>
              {X_LINK && (
                <li>
                  <a
                    href={X_LINK.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-dock-x
                    data-href-placeholder={X_LINK.placeholder || undefined}
                    className={plainRow}
                  >
                    <span>
                      Follow on X<span className="sr-only"> (opens in a new tab)</span>
                    </span>
                    <XGlyph width={16} height={16} className="text-muted-foreground" />
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div className="shrink-0 px-(--gutter) pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <LaunchLink className="h-14 w-full text-sm" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
