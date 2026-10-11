import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { useMediaQuery } from '@/lib/use-media-query';
import { WindleLogo } from '../story/brand/WindleLogo';
import type { ChapterKey } from '../story/chapters';
import { chapterPath } from '../story/routes';
import { DOCS_URL, PROTOCOL_ITEMS, SIGN_IN_URL, X_LINK } from './nav-data';
import { ArrowUpRightGlyph, XGlyph } from './nav-icons';
import { LaunchLink, ProtocolRow } from './nav-parts';

const DESKTOP_QUERY = '(min-width: 48rem)'; // Tailwind `md`

const groupLabel = 'px-3 text-xs font-medium tracking-wide text-muted-foreground';
const barButton =
  'inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-foreground/8 px-4 text-sm font-medium text-foreground shadow-[inset_0_1px_0_var(--nav-specular),inset_0_0_0_1px_var(--nav-line)] transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none active:bg-foreground/16 data-[state=open]:bg-foreground/12 [@media(hover:hover)]:hover:bg-foreground/14';
const plainRow =
  'flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 text-base font-medium text-foreground transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none active:bg-foreground/10 [@media(hover:hover)]:hover:bg-foreground/6';

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
          Menu
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
          className="fixed inset-0 z-(--z-sheet) flex flex-col bg-background pt-[env(safe-area-inset-top,0px)] outline-none md:hidden"
        >
          <div className="flex h-(--topbar-height) shrink-0 items-center justify-between px-(--gutter)">
            <a
              href={chapterPath('hero')}
              onClick={close}
              className="inline-flex items-center py-2 [&_[data-windle-mark]]:text-foreground"
            >
              <WindleLogo markSize={20} wordmarkClassName="text-base font-extrabold tracking-[-0.03em] uppercase" />
              <span className="sr-only">, back to top</span>
            </a>
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close menu" className={barButton}>
                Close
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-(--gutter) py-4">
            <section aria-labelledby="sheet-protocol" className="flex flex-col">
              <h2 id="sheet-protocol" className={groupLabel}>
                Protocol
              </h2>
              <ul className="mt-2 flex flex-col gap-0.5">
                {PROTOCOL_ITEMS.map((item) => (
                  <li key={item.id}>
                    <ProtocolRow item={item} current={item.id === activeId} size="sheet" onClick={close} />
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="sheet-more" className="flex flex-col">
              <h2 id="sheet-more" className={groupLabel}>
                More
              </h2>
              <ul className="mt-2 flex flex-col gap-0.5">
                <li>
                  <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={plainRow}>
                    <span>
                      Docs<span className="sr-only"> (opens in a new tab)</span>
                    </span>
                    <ArrowUpRightGlyph className="text-muted-foreground" />
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
            </section>
          </div>

          <div className="shrink-0 px-(--gutter) pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <LaunchLink className="h-14 w-full text-sm" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
