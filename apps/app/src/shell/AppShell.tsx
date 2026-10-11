import { WindleMark } from '@windle/brand';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Button } from '@/components/Button';
import { CopyButton } from '@/components/CopyButton';
import { shortAddress } from '@/lib/format';
import { NAV_ITEMS } from './nav';

type Props = {
  /** Undefined while the session is loading: the header keeps its size and shows a placeholder. */
  address?: string;
  onSignOut?: () => void;
  signingOut?: boolean;
  /** Banner slot under the header (sign-out failure and the like). */
  notice?: ReactNode;
  children: ReactNode;
};

const navLink =
  'group flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 text-sm font-medium text-muted-foreground transition-[background-color,border-color,color] duration-(--dur-fast) ease-(--ease-standard) hover:bg-surface-navy-raised/50 hover:text-foreground aria-[current=page]:border-border-accent/50 aria-[current=page]:bg-surface-navy-raised/70 aria-[current=page]:text-foreground';

const dockLink =
  'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-pill px-2 text-kicker font-medium tracking-wide text-muted-foreground transition-colors duration-(--dur-fast) aria-[current=page]:bg-surface-navy-raised aria-[current=page]:text-foreground';

export function AppShell({ address, onSignOut, signingOut = false, notice, children }: Props) {
  return (
    <div className="bg-aura min-h-dvh overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-pill focus:bg-emphasis focus:px-4 focus:py-2 focus:text-emphasis-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-(--z-header) flex h-(--header-height) items-center justify-between gap-3 border-b border-border/30 bg-caption px-(--gutter) backdrop-blur-xl">
        <NavLink to="/" aria-label="windle, dashboard" className="flex items-center gap-2.5 rounded-md">
          {/* TODO(motion): reuse the "Классика" jelly on the header mark */}
          <WindleMark decorative size={28} />
          <span className="font-display text-sm font-black lowercase tracking-tight max-sm:sr-only">windle</span>
        </NavLink>

        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex h-10 min-w-0 items-center gap-1 rounded-pill border border-border-strong/25 bg-surface/50 pr-1 pl-4">
            {address ? (
              <>
                <span className="truncate font-mono text-sm" title={address}>
                  {shortAddress(address)}
                </span>
                <CopyButton value={address} label="Copy wallet address" />
              </>
            ) : (
              <span
                aria-hidden="true"
                className="my-auto mr-3 h-3 w-24 rounded-md bg-muted motion-safe:animate-pulse"
              />
            )}
          </div>
          <Button
            variant="ghost"
            onClick={onSignOut}
            disabled={!onSignOut || signingOut}
            className="min-h-10 px-3 sm:px-4"
            aria-label="Sign out"
          >
            <svg
              viewBox="0 0 20 20"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
              className="sm:hidden"
            >
              <path
                d="M8 3.5H5.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2H8M12 6l4 4-4 4M16 10H8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="max-sm:hidden" aria-hidden="true">
              {signingOut ? 'Signing out…' : 'Sign out'}
            </span>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl md:grid-cols-[14.5rem_minmax(0,1fr)]">
        <nav
          aria-label="Main"
          className="sticky top-(--header-height) hidden h-[calc(100dvh-var(--header-height))] flex-col gap-1 px-4 py-6 md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLink}>
              <span className="text-accent-text">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main
          id="main"
          tabIndex={-1}
          className="flex min-w-0 flex-col gap-8 px-(--gutter) pt-8 pb-[calc(var(--dock-clearance)+1.5rem)] outline-none md:pb-16"
        >
          {notice}
          {children}
        </main>
      </div>

      {/* Mobile: floating dock pill, same idea as the landing's bottom dock. */}
      <nav
        aria-label="Main, bottom bar"
        className="fixed bottom-[calc(var(--dock-gap)+env(safe-area-inset-bottom,0px))] left-1/2 z-(--z-dock) grid h-(--dock-height) w-[min(calc(100%-2*var(--gutter)),26rem)] -translate-x-1/2 grid-cols-4 items-center rounded-pill border border-border-strong/30 bg-caption px-1.5 shadow-glow backdrop-blur-xl md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={dockLink}>
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
