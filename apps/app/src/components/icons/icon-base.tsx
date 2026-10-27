import { LazyMotion, m, type Transition } from 'motion/react';
import type { ReactNode } from 'react';

export type AnimatedIconProps = {
  /** Plays the hover animation; the icon is static whenever this is false. */
  active: boolean;
  size?: number;
  className?: string;
};

/** Seconds, mirroring --dur-* in tokens.css. */
export const DUR = { fast: 0.18, base: 0.26, slow: 0.42 } as const;

/** --ease-standard */
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;

export const SPRING: Transition = { type: 'spring', visualDuration: DUR.base, bounce: 0 };

type Props = AnimatedIconProps & { children: ReactNode };

// static until hovered, so the animation features load after first paint, off the main chunk
const loadFeatures = () => import('./motion-features').then((mod) => mod.default);

export function IconSvg({ active, size = 18, className, children }: Props) {
  return (
    <LazyMotion features={loadFeatures}>
      <m.svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        overflow="visible"
        className={className ? `shrink-0 ${className}` : 'shrink-0'}
        initial={false}
        animate={active ? 'animate' : 'normal'}
      >
        {children}
      </m.svg>
    </LazyMotion>
  );
}
