import type { ComponentPropsWithRef } from 'react';

type IconProps = ComponentPropsWithRef<'svg'>;

// Decorative glyphs: always inside a control that carries its own accessible name.
const base = {
  role: 'presentation',
  'aria-hidden': true,
  focusable: false,
  fill: 'none',
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
} as const;

export function XGlyph(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function GitHubGlyph(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} fill="currentColor" {...props}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

export function MenuGlyph(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg
      {...base}
      viewBox="0 0 20 20" // 1 unit = 1 CSS px at 20px, so the 2px strokes land on whole pixels
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="shrink-0"
      {...props}
    >
      <path d="M3 6h14M3 14h14" />
    </svg>
  );
}

export function CloseGlyph(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg {...base} stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronDownGlyph(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg
      {...base}
      width={14}
      height={14}
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ArrowUpRightGlyph(props: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden via `base`
    <svg
      {...base}
      width={12}
      height={12}
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 17L17 7M8 7h9v9" />
    </svg>
  );
}
