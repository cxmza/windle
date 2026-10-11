import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';
import { chapterPath } from '../story/routes';
import { APP_URL, type ProtocolItem, SIGN_IN_URL } from './nav-data';

/** Hover only where hovering exists; the white focus ring comes from globals.css ([data-dock-root] :focus-visible). */
const hoverText =
  'transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none [@media(hover:hover)]:hover:text-foreground active:text-foreground';

/** The 2px electric-blue underline under a bar link: grows from the left on hover, and stays on the active one. */
const underline = cn(
  'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-2 after:h-0.5 after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-(--dur-fast) after:ease-decelerate motion-reduce:after:transition-none',
  '[@media(hover:hover)]:hover:after:scale-x-100 active:after:scale-x-100 data-active:after:scale-x-100 aria-[current]:after:scale-x-100 data-[state=open]:after:scale-x-100',
);

const monoLabel = 'font-mono text-xs font-medium tracking-[0.14em] whitespace-nowrap uppercase';

/** Top-level bar item (trigger or link): mono uppercase 12px, blue underline on hover / active / open. */
export const navItemClass = cn(
  hoverText,
  underline,
  monoLabel,
  'relative inline-flex h-10 items-center gap-1.5 px-3 text-muted-foreground',
  'data-active:text-foreground aria-[current]:text-foreground data-[state=open]:text-foreground',
);

export function SignInLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a href={SIGN_IN_URL} data-dock-signin className={cn(navItemClass, className)} {...props}>
      Sign in
    </a>
  );
}

/** Solid white rectangle, black mono label; hover turns it electric blue with white text. */
export function LaunchLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a
      href={APP_URL}
      data-dock-cta
      className={cn(
        monoLabel,
        'inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-foreground px-4 font-semibold text-background transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none active:bg-accent-hover active:text-accent-foreground [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground',
        className,
      )}
      {...props}
    >
      Launch app
      <span aria-hidden="true">→</span>
    </a>
  );
}

type ProtocolRowProps = Omit<ComponentPropsWithRef<'a'>, 'href'> & {
  item: ProtocolItem;
  current: boolean;
  /** `sheet`: huge stacked Unbounded rows for the mobile menu. */
  size?: 'menu' | 'sheet';
};

/** One chapter row: mono number, heavy Unbounded title, muted one-line description (menu only). Links to the chapter's clean path. */
export function ProtocolRow({ item, current, size = 'menu', className, ...props }: ProtocolRowProps) {
  const sheet = size === 'sheet';
  return (
    <a
      href={chapterPath(item.id)}
      data-dock-link={item.id}
      className={cn(
        'relative flex items-center gap-4 outline-offset-[-2px] transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none [@media(hover:hover)]:hover:bg-foreground/6 active:bg-foreground/10',
        'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:origin-top before:scale-y-0 before:bg-accent before:transition-transform before:duration-(--dur-fast) before:ease-decelerate motion-reduce:before:transition-none',
        '[@media(hover:hover)]:hover:before:scale-y-100 aria-[current]:before:scale-y-100',
        sheet ? 'min-h-12 py-1.5' : 'px-4 py-3',
        className,
      )}
      {...props}
      // after the spread: Radix's Link (asChild) passes its own aria-current=undefined
      aria-current={current ? 'location' : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          'w-6 shrink-0 font-mono text-xs font-medium tracking-[0.14em] tabular-nums',
          current ? 'text-accent-text' : 'text-muted-foreground',
        )}
      >
        {item.number}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            'font-display font-extrabold tracking-[-0.02em] text-foreground uppercase',
            sheet ? 'text-[clamp(1.25rem,6.4vw,1.75rem)] leading-none' : 'text-[0.8125rem] leading-tight',
          )}
        >
          {item.label}
        </span>
        {!sheet && <span className="truncate text-[0.8125rem] leading-snug text-muted-foreground">{item.summary}</span>}
      </span>
    </a>
  );
}
