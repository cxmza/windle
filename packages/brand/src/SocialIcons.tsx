import type { ComponentPropsWithRef } from 'react';

type IconProps = ComponentPropsWithRef<'svg'>;

const base = {
  role: 'presentation',
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
} as const;

const stroked = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Decorative glyphs: always inside a control that carries its own accessible name. */
export function XIcon(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} fill="currentColor" {...props}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

/** A tilted two-tone capsule: a generic pill glyph, not pump.fun's own artwork. */
export function PumpFunIcon(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} {...stroked} strokeWidth={2} {...props}>
      <g transform="rotate(-45 12 12)">
        <rect x="2.5" y="7" width="19" height="10" rx="5" />
        <path d="M12 7h4.5a5 5 0 0 1 0 10H12z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} {...stroked} strokeWidth={2} {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} {...stroked} strokeWidth={2.25} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
