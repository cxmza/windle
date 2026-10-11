import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';
import { chapterPath } from '../story/routes';
import { APP_URL, type ProtocolItem, SIGN_IN_URL } from './nav-data';

/** Hover only where hovering exists; the white focus ring comes from globals.css ([data-dock-root] :focus-visible). */
const hoverText =
  'transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none [@media(hover:hover)]:hover:text-foreground active:text-foreground';

/** Hover / active / open state of a bar link: a soft glass pill behind the label (colour only, no layout). */
const pillState =
  '[@media(hover:hover)]:hover:bg-(--nav-hover) active:bg-(--nav-hover) data-active:bg-(--nav-hover) aria-[current]:bg-(--nav-hover) data-[state=open]:bg-(--nav-hover)';

/** Top-level bar item (trigger or link): clean sans 14px medium, rounded-full hover / active / open pill. */
export const navItemClass = cn(
  hoverText,
  pillState,
  'relative inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground',
  'data-active:text-foreground aria-[current]:text-foreground data-[state=open]:text-foreground',
);

export function SignInLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a href={SIGN_IN_URL} data-dock-signin className={cn(navItemClass, className)} {...props}>
      Sign in
    </a>
  );
}

/** Pill CTA: light fill with a top highlight, dark label; hover turns it electric blue with white text. */
export function LaunchLink({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a
      href={APP_URL}
      data-dock-cta
      className={cn(
        'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold whitespace-nowrap text-background shadow-[inset_0_1px_0_var(--nav-specular)] transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none active:bg-accent-hover active:text-accent-foreground [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground',
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
        'relative flex items-center gap-4 rounded-2xl outline-offset-[-2px] transition-colors duration-(--dur-instant) ease-standard motion-reduce:transition-none [@media(hover:hover)]:hover:bg-foreground/6 active:bg-foreground/10',
        'aria-[current]:bg-foreground/8',
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
