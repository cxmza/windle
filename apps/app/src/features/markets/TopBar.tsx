import { WindleMark } from '@windle/brand';
import { NavLink } from 'react-router';
import { shortAddress } from '@/lib/format';
import { NAV_ITEMS } from '@/shell/nav';

type Props = {
  address: string;
  onSignOut: () => void;
  signingOut: boolean;
};

const item =
  'relative inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) aria-[current=page]:text-foreground [@media(hover:hover)]:hover:bg-(--nav-hover) [@media(hover:hover)]:hover:text-foreground md:px-4';

export function TopBar({ address, onSignOut, signingOut }: Props) {
  return (
    <header
      data-topbar
      className="pointer-events-none fixed inset-x-0 top-0 z-(--z-dock) px-(--gutter) pt-[calc(var(--nav-offset)+env(safe-area-inset-top,0px))]"
    >
      <div
        data-glass
        className="pointer-events-auto mx-auto flex h-(--topbar-height) w-full max-w-[68.75rem] items-center justify-between gap-2 pr-2 pl-4 md:pl-5"
      >
        <NavLink
          to="/"
          end
          aria-label="windle, markets"
          className="flex shrink-0 items-center gap-2.5 rounded-full py-2"
        >
          <WindleMark decorative size={22} />
          <span className="font-display text-base font-extrabold tracking-[-0.03em] uppercase max-md:sr-only">
            windle
          </span>
        </NavLink>

        <nav aria-label="Main" className="flex min-w-0 items-center">
          {NAV_ITEMS.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={item} aria-label={n.label}>
              <span className="text-accent-text md:hidden [&_svg]:size-5" aria-hidden="true">
                {n.to === '/' ? null : n.icon}
              </span>
              <span className={n.to === '/' ? '' : 'max-md:hidden'}>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 max-md:hidden">
          <span
            className="inline-flex h-10 items-center rounded-full border border-(--hairline) px-4 font-mono text-sm tabular-nums"
            title={address}
          >
            {shortAddress(address)}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) disabled:opacity-50 [@media(hover:hover)]:enabled:hover:bg-(--nav-hover) [@media(hover:hover)]:enabled:hover:text-foreground"
          >
            <svg
              viewBox="0 0 20 20"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path
                d="M8 3.5H5.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2H8M12 6l4 4-4 4M16 10H8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
