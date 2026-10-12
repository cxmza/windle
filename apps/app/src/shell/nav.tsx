import type { ReactElement } from 'react';

export type NavItem = { to: string; label: string; end?: boolean; icon: ReactElement };

const svg = (children: ReactElement) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Markets',
    end: true,
    icon: svg(<path d="M4 20V11M10 20V6M16 20v-6M22 20H2" strokeLinecap="round" />),
  },
  {
    to: '/projects',
    label: 'Projects',
    icon: svg(
      <>
        <rect x="3.5" y="4" width="17" height="16" rx="5" />
        <path d="M8 16V9l4 5 4-5v7" strokeLinecap="round" strokeLinejoin="round" />
      </>,
    ),
  },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: svg(
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      </>,
    ),
  },
  {
    to: '/promises',
    label: 'Promises',
    icon: svg(
      <>
        <path d="M6 21V4" strokeLinecap="round" />
        <path d="M6 5h11l-2.5 4L17 13H6" strokeLinejoin="round" />
      </>,
    ),
  },
  {
    to: '/account',
    label: 'Account',
    icon: svg(
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" strokeLinecap="round" />
      </>,
    ),
  },
];
