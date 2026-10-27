import { WindleMark } from '@windle/brand';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AccountMenu } from './AccountMenu';
import { EndingSoon } from './EndingSoon';
import { NAV_ITEMS } from './nav';
import { SidebarLink } from './SidebarLink';
import { SidebarSocials } from './SidebarSocials';

type Props = {
  rail: boolean;
  onNavigate?: (() => void) | undefined;
  /** Collapse toggle on desktop, close button in the drawer; first in the row so it stays put in the rail. */
  headerAction: ReactNode;
};

export function SidebarContent({ rail, onNavigate, headerAction }: Props) {
  return (
    <>
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-(--hairline) p-2 pl-2.5">
        {headerAction}
        {rail ? null : (
          <Link
            to="/"
            onClick={onNavigate}
            className="flex h-9 items-center rounded-md text-foreground max-md:h-10 [@media(hover:hover)]:hover:opacity-80"
          >
            <span data-sidebar-label className="flex items-center gap-2.5">
              <WindleMark decorative size={22} />
              <span className="text-sm font-bold lowercase tracking-tight">windle</span>
            </span>
          </Link>
        )}
      </div>

      <nav
        aria-label="Main"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-2 py-2"
      >
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((i) => (
            <li key={i.to} className="contents">
              <SidebarLink {...i} rail={rail} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        {rail ? null : <EndingSoon onNavigate={onNavigate} />}
      </nav>

      <div className="flex shrink-0 flex-col gap-2 border-t border-(--hairline) p-2">
        <SidebarSocials rail={rail} />
        <AccountMenu rail={rail} onNavigate={onNavigate} />
      </div>
    </>
  );
}
