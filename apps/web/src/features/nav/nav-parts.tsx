import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';
import { chapterPath } from '../story/routes';
import { APP_URL, type ProtocolItem, SIGN_IN_URL } from './nav-data';

/** Top-level bar item (trigger or link): white label with a hair of shadow; hover / active / open = a small inner glass bubble (.dock-item, globals.css). */
export const navItemClass = cn(
  'dock-item relative inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap text-(--nav-text) transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none',
  '[@media(hover:hover)]:hover:text-foreground active:text-foreground data-active:text-foreground aria-[current]:text-foreground data-[state=open]:text-foreground',
);

export function SignInLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a href={SIGN_IN_URL} data-dock-signin className={cn(navItemClass, className)} {...props}>
      Sign in
    </a>
  );
}

/** Solid white pill CTA: the contrast anchor of the glass bar, with a top highlight, dark label; hover turns it electric blue with white text. */
export function LaunchLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a
      href={APP_URL}
      data-dock-cta
      className={cn(
        'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold whitespace-nowrap text-background shadow-[inset_0_1px_0_var(--nav-hl-top)] transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none active:bg-accent-hover active:text-accent-foreground [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground',
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

/** One chapter row: number, heavy Unbounded title, muted one-line description (menu only). Links to the chapter's clean path. */
export function ProtocolRow({ item, current, size = 'menu', className, ...props }: ProtocolRowProps) {
  const sheet = size === 'sheet';
  return (
    <a
      href={chapterPath(item.id)}
      data-dock-link={item.id}
      className={cn(
        'dock-row relative flex items-center gap-4 rounded-2xl outline-offset-[-2px] transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none',
        sheet ? 'min-h-12 px-3 py-1.5' : 'px-3 py-2.5',
        className,
      )}
      {...props}
      // after the spread: Radix's Link (asChild) passes its own aria-current=undefined
      aria-current={current ? 'location' : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          'w-6 shrink-0 text-xs font-medium tabular-nums',
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
