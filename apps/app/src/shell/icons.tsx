import type { ReactElement } from 'react';

export function glyph(children: ReactElement, size = 18) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export const CloseIcon = () => glyph(<path d="M6 6l12 12M18 6L6 18" />);

export const CheckIcon = () => glyph(<path d="m5 12.5 4.5 4.5L19 7.5" />);

export const ChevronUpDownIcon = () => glyph(<path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />, 16);

export const UserIcon = () =>
  glyph(
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>,
  );

export const SearchIcon = () =>
  glyph(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>,
    16,
  );

export const ChevronLeftIcon = () => glyph(<path d="m14.5 6-6 6 6 6" />, 18);

export const ChevronRightIcon = () => glyph(<path d="m9.5 6 6 6-6 6" />, 16);

export const ChevronDownIcon = () => glyph(<path d="m7 10 5 5 5-5" />, 16);

export const SlidersIcon = () =>
  glyph(
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>,
  );

export const DisplayIcon = () =>
  glyph(
    <>
      <rect x="3.5" y="4.5" width="17" height="11.5" rx="2.5" />
      <path d="M9 20h6M12 16v4" />
    </>,
  );

export const CodeIcon = () => glyph(<path d="m9 7-5 5 5 5M15 7l5 5-5 5" />);

export const ExternalIcon = () =>
  glyph(
    <path d="M14 5h5v5M19 5l-8 8M18 14v3.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.5v-9A1.5 1.5 0 0 1 7.5 7H10" />,
    14,
  );

export const BookIcon = () =>
  glyph(<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v12.5H6.5A1.5 1.5 0 0 0 5 18Zm0 12.5A1.5 1.5 0 0 0 6.5 19.5H19" />);

export const GlobeIcon = () =>
  glyph(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z" />
    </>,
  );
