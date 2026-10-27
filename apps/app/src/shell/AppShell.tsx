import { Tooltip } from 'radix-ui';
import { type ReactNode, use } from 'react';
import { ToastProvider } from '@/components/Toast';
import { SessionContext } from '@/features/session/session-context';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { MobileMenu } from './MobileMenu';
import { Sidebar } from './Sidebar';
import { SidebarCollapsedContext } from './sidebar-state';
import { useSidebarCollapsed } from './use-sidebar-collapsed';
import { useSidebarFlip } from './use-sidebar-flip';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, commitToggle] = useSidebarCollapsed();
  const captureFlip = useSidebarFlip(collapsed);
  const toggle = () => {
    captureFlip();
    commitToggle();
  };
  const session = use(SessionContext);
  const signOutFailed = session?.signOut.failed ?? false;

  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={200}>
      <ToastProvider>
        <div data-shell data-collapsed={collapsed || undefined} className="min-h-dvh overflow-x-clip">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-pencil) focus:rounded-lg focus:bg-emphasis focus:px-4 focus:py-2 focus:text-emphasis-foreground"
          >
            Skip to content
          </a>

          <Sidebar collapsed={collapsed} onToggle={toggle} />
          <MobileMenu />
          {session ? <SettingsDialog /> : null}

          {signOutFailed ? (
            <div
              role="alert"
              data-sidebar-offset
              data-sidebar-flip
              className="fixed top-[calc(var(--menu-clearance)+var(--nav-offset))] right-(--gutter) left-(--gutter) z-(--z-dock) max-w-md rounded-lg border border-(--hairline) bg-(--panel-surface) px-4 py-3 text-sm md:left-[calc(var(--sidebar-w)+var(--gutter))]"
            >
              Could not sign out. Check your connection and try again.
            </div>
          ) : null}

          <main id="main" tabIndex={-1} data-sidebar-offset className="min-w-0 outline-none md:pl-(--sidebar-w)">
            <SidebarCollapsedContext value={collapsed}>{children}</SidebarCollapsedContext>
          </main>
        </div>
      </ToastProvider>
    </Tooltip.Provider>
  );
}
