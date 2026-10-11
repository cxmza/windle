import type { ReactNode } from 'react';

// App-wide providers. Empty on purpose: motion runs on GSAP (src/lib/gsap.ts) and CSS, each of which honours
// prefers-reduced-motion where the animation is defined (gsap.matchMedia / NO_MOTION_PREF_QUERY checks /
// motion-safe variants). Motion (motion/react) was dropped from the bundle: its last user was GSAP-driven
// now. If Motion comes back, wrap children in <MotionConfig reducedMotion="user"> here.
export function AppProviders({ children }: { children: ReactNode }) {
  return children;
}
