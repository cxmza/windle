import type { ReactNode } from 'react';
import { Outlet } from 'react-router';

type Props = { stack?: boolean; children?: ReactNode };

/** Padded, centred column for ordinary pages. Clears the floating menu button on small screens. */
export function PageFrame({ stack = false, children }: Props) {
  return (
    <div
      data-sidebar-flip
      className={`mx-auto w-full max-w-[88rem] px-4 pt-[calc(var(--menu-clearance)+1rem)] pb-12 md:px-6 md:pt-6 ${stack ? 'flex flex-col gap-6' : ''}`}
    >
      {children ?? <Outlet />}
    </div>
  );
}
