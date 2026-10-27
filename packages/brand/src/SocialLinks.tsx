import type { ComponentType, ReactElement } from 'react';
import { cn } from './cn.ts';
import { GitHubIcon, XIcon } from './SocialIcons.tsx';
import { SOCIALS, type SocialSlot } from './socials.ts';

type Meta = { label: string; Icon: ComponentType<{ className?: string }> };

export const SOCIAL_META = {
  x: { label: 'X', Icon: XIcon },
  github: { label: 'GitHub', Icon: GitHubIcon },
} as const satisfies Record<SocialSlot, Meta>;

export const SOCIAL_ORDER: readonly SocialSlot[] = ['github', 'x'];

export type SocialEntry = { slot: SocialSlot; label: string; href: string | null };

/**
 * The socials to render. A null link is dropped unless `showPlaceholders` (dev only: apps pass `import.meta.env.DEV`),
 * so production never shows or links a dead entry.
 */
export function socialEntries(showPlaceholders = false): SocialEntry[] {
  return SOCIAL_ORDER.flatMap((slot) => {
    const href = SOCIALS[slot];
    return href === null && !showPlaceholders ? [] : [{ slot, label: SOCIAL_META[slot].label, href }];
  });
}

const SIZES = { sm: 'size-8', md: 'size-9', lg: 'size-10' } as const;

const linkBase =
  'inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const linkLive =
  'active:bg-foreground/15 active:text-foreground [@media(hover:hover)]:hover:bg-foreground/10 [@media(hover:hover)]:hover:text-foreground';
const linkPlaceholder = 'cursor-not-allowed border border-dashed border-border opacity-50';

type Props = {
  size?: keyof typeof SIZES;
  /** `ghost`: round, no plate until hovered (glass bars). `outline`: square hairline button (footer). */
  variant?: 'ghost' | 'outline';
  orientation?: 'horizontal' | 'vertical';
  /** Dev review aid: render unset links as dimmed, dashed, non-interactive stand-ins. */
  showPlaceholders?: boolean;
  className?: string;
  linkClassName?: string;
  /** Wrap each rendered item (e.g. in a tooltip for the collapsed rail). */
  wrap?: (item: ReactElement, entry: SocialEntry) => ReactElement;
};

/** Icon-only GitHub / X links, one source of truth in socials.ts. Renders nothing when there is nothing to show. */
export function SocialLinks({
  size = 'md',
  variant = 'ghost',
  orientation = 'horizontal',
  showPlaceholders = false,
  className,
  linkClassName,
  wrap,
}: Props) {
  const entries = socialEntries(showPlaceholders);
  if (entries.length === 0) return null;
  const shape = variant === 'ghost' ? 'rounded-full' : 'rounded-md border border-border/60';
  return (
    <ul
      data-social-links
      className={cn('flex items-center gap-0.5', orientation === 'vertical' && 'flex-col', className)}
    >
      {entries.map((entry) => {
        const { Icon } = SOCIAL_META[entry.slot];
        const item =
          entry.href === null ? (
            <span
              role="img"
              aria-label={`${entry.label} link not set`}
              title={`${entry.label} link not set`}
              data-social={entry.slot}
              data-placeholder=""
              className={cn(linkBase, SIZES[size], shape, linkPlaceholder, linkClassName)}
            >
              <Icon />
            </span>
          ) : (
            <a
              href={entry.href}
              target="_blank"
              rel="noopener noreferrer"
              data-social={entry.slot}
              aria-label={`windle on ${entry.label} (opens in a new tab)`}
              className={cn(linkBase, linkLive, SIZES[size], shape, linkClassName)}
            >
              <Icon />
            </a>
          );
        return (
          <li key={entry.slot} className="contents">
            {wrap ? wrap(item, entry) : item}
          </li>
        );
      })}
    </ul>
  );
}
