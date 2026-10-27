/*
 * Adapted from lucide-animated (https://lucide-animated.com, https://github.com/pqoqubbw/icons),
 * Copyright (c) 2024-2026 pqoqubbw, MIT License — see ./LICENSE. Paths are Lucide's.
 * Changes: driven by an `active` prop instead of their own hover handlers, shorter and calmer
 * timings, and every icon shows its full static glyph at rest.
 */
import { m, type Variants } from 'motion/react';
import { type AnimatedIconProps, DUR, EASE_STANDARD, IconSvg, SPRING } from './icon-base';

const once = { duration: DUR.slow, ease: EASE_STANDARD };

const barGrow: Variants = {
  normal: { pathLength: 1 },
  animate: (i: number) => ({
    pathLength: [0, 1],
    transition: { duration: DUR.base, ease: EASE_STANDARD, delay: i * 0.06 },
  }),
};

export function ChartColumnIncreasingIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <m.path d="M8 17v-3" custom={0} variants={barGrow} />
      <m.path d="M13 17V9" custom={1} variants={barGrow} />
      <m.path d="M18 17V5" custom={2} variants={barGrow} />
    </IconSvg>
  );
}

const lift: Variants = {
  normal: { y: 0 },
  animate: { y: [0, -2.5, 0], transition: { ...once, times: [0, 0.45, 1] } },
};

export function TrophyIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <m.g variants={lift}>
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </m.g>
    </IconSvg>
  );
}

const redraw = (delay = 0): Variants => ({
  normal: { pathLength: 1 },
  animate: { pathLength: [0, 1], transition: { duration: DUR.base, ease: EASE_STANDARD, delay } },
});

const hop: Variants = {
  normal: { y: 0, rotate: 0 },
  animate: {
    y: [0, -3, 0],
    rotate: [0, -4, 0],
    transition: { duration: DUR.slow, ease: EASE_STANDARD, times: [0, 0.45, 1] },
  },
};

export function WalletIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <m.g variants={hop} style={{ transformOrigin: '12px 12px' }}>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </m.g>
    </IconSvg>
  );
}

const write: Variants = {
  normal: { rotate: 0, x: 0, y: 0 },
  animate: {
    rotate: [-0.5, 0.5, -0.5],
    x: [0, -1, 1.5, 0],
    y: [0, 1.5, -1, 0],
    transition: { duration: DUR.slow, ease: EASE_STANDARD },
  },
};

export function SquarePenIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <m.path
        d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
        variants={write}
      />
    </IconSvg>
  );
}

const nudge = (dx: number): Variants => ({
  normal: { x: 0 },
  animate: { x: [0, dx, 0], transition: { ...once, times: [0, 0.4, 1] } },
});

export function PanelLeftCloseIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <m.path d="m16 15-3-3 3-3" variants={nudge(-1.5)} />
    </IconSvg>
  );
}

export function PanelLeftOpenIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <m.path d="m14 9 3 3-3 3" variants={nudge(1.5)} />
    </IconSvg>
  );
}

const turn: Variants = {
  normal: { rotate: 0, transition: SPRING },
  animate: { rotate: 90, transition: { type: 'spring', visualDuration: DUR.slow, bounce: 0 } },
};

export function SettingsIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <m.g variants={turn}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </m.g>
    </IconSvg>
  );
}

const shift = (d: number): Variants => ({
  normal: { x: 0, y: 0, transition: SPRING },
  animate: { x: d, y: d, transition: SPRING },
});

export function CopyIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <m.rect x="8" y="8" width="14" height="14" rx="2" variants={shift(-3)} />
      <m.path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" variants={shift(3)} />
    </IconSvg>
  );
}

const exit: Variants = {
  normal: { x: 0, transition: SPRING },
  animate: { x: 2, transition: SPRING },
};

export function LogoutIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <m.g variants={exit}>
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" x2="9" y1="12" y2="12" />
      </m.g>
    </IconSvg>
  );
}

const line: Variants = {
  normal: { scaleX: 1 },
  animate: (i: number) => ({
    scaleX: [1, 0.6, 1],
    transition: { ...once, times: [0, 0.4, 1], delay: i * 0.05 },
  }),
};

export function MenuIcon(props: AnimatedIconProps) {
  return (
    <IconSvg size={20} {...props}>
      <m.line x1="4" x2="20" y1="6" y2="6" custom={0} variants={line} style={{ originX: 0 }} />
      <m.line x1="4" x2="20" y1="12" y2="12" custom={1} variants={line} style={{ originX: 0 }} />
      <m.line x1="4" x2="20" y1="18" y2="18" custom={2} variants={line} style={{ originX: 0 }} />
    </IconSvg>
  );
}

export function XIcon(props: AnimatedIconProps) {
  return (
    <IconSvg {...props}>
      <m.path d="M18 6 6 18" variants={redraw()} />
      <m.path d="m6 6 12 12" variants={redraw(0.08)} />
    </IconSvg>
  );
}
