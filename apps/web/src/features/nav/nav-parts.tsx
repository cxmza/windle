import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';
import { APP_URL, SIGN_IN_URL } from './nav-data';

const navText =
  'text-(length:--nav-font-size) font-medium tracking-(--nav-tracking) whitespace-nowrap text-(--nav-text) transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none';

/** Capsule item: 44px target, Inter Tight 15/500, white at 88% rising to 100%; the sliding bubble (nav-bubble.ts) sits behind it. */
export const navItemClass = cn(
  'relative inline-flex h-11 items-center gap-1.5 rounded-full px-3.5',
  navText,
  '[@media(hover:hover)]:hover:text-foreground active:text-foreground data-active:text-foreground aria-[current]:text-foreground',
);

/** Ghost item for the actions island: no plate until hovered. */
export function SignInLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a href={SIGN_IN_URL} data-dock-signin className={cn('dock-item', navItemClass, className)} {...props}>
      Sign in
    </a>
  );
}

/** Primary action: a solid white pill, so it keeps full contrast over any backdrop the glass lets through; hover turns it electric blue. */
export function LaunchLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a
      href={APP_URL}
      data-dock-cta
      className={cn(
        'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-(length:--nav-font-size) font-semibold tracking-(--nav-tracking) whitespace-nowrap text-background shadow-(--nav-cta-shadow) transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none active:bg-accent-hover active:text-accent-foreground [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground',
        className,
      )}
      {...props}
    >
      Launch app
      <span aria-hidden="true">→</span>
    </a>
  );
}
