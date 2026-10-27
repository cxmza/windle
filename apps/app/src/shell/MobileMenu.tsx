import { CaChip, SocialLinks, useTokenCa } from '@windle/brand';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { MenuIcon, XIcon } from '@/components/icons/lucide-animated';
import { useIconTrigger } from '@/components/icons/use-icon-trigger';
import { SidebarContent } from './SidebarContent';

const iconButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [menuActive, menuTrigger] = useIconTrigger();
  const [closeActive, closeTrigger] = useIconTrigger();
  const ca = useTokenCa(import.meta.env.DEV);
  const close = () => setOpen(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-(--z-header) h-(--menu-clearance) border-b border-(--hairline) bg-background md:hidden"
      />
      <div className="fixed top-[calc(0.375rem+env(safe-area-inset-top,0px))] right-2 z-(--z-header) flex h-11 items-center gap-1 md:hidden">
        <SocialLinks size="md" showPlaceholders={import.meta.env.DEV} />
        <CaChip address={ca} compact />
      </div>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          data-settings-return
          {...menuTrigger}
          className={`${iconButton} fixed top-[calc(0.375rem+env(safe-area-inset-top,0px))] left-2 z-(--z-header) text-foreground md:hidden`}
        >
          <MenuIcon active={menuActive} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay data-scrim className="fixed inset-0 z-(--z-sheet) bg-scrim md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          data-drawer
          className="fixed inset-y-0 left-0 z-(--z-sheet) flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-(--hairline) bg-surface pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] outline-none md:hidden"
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <SidebarContent
            rail={false}
            onNavigate={close}
            headerAction={
              <Dialog.Close asChild>
                <button type="button" aria-label="Close menu" {...closeTrigger} className={iconButton}>
                  <XIcon active={closeActive} />
                </button>
              </Dialog.Close>
            }
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
