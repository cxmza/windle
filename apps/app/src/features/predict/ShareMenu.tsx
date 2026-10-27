import type { ApiMarket } from '@windle/shared';
import { DropdownMenu } from 'radix-ui';
import { useToast } from '@/components/Toast';
import { shareLink, xIntentUrl } from './share';

type Props = {
  market: Pick<ApiMarket, 'slug' | 'statement' | 'probYes' | 'tier' | 'shareUrl'>;
  /** `button` is the labelled control of the market page; `icon` is the compact one of a list row. */
  variant?: 'button' | 'icon';
};

const trigger =
  'relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-(--selected) data-[state=open]:bg-(--selected) data-[state=open]:text-foreground [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground';

const item =
  'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm text-foreground outline-none select-none data-[highlighted]:bg-(--hover) data-[disabled]:opacity-50';

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 12.5V3.5m0 0L6.5 7M10 3.5 13.5 7M4.5 11v4a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-4" />
    </svg>
  );
}

export function ShareMenu({ market, variant = 'button' }: Props) {
  const toast = useToast();
  const link = shareLink(market);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied');
    } catch {
      toast('Could not copy the link');
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-share
        aria-label={variant === 'icon' ? `Share: ${market.statement}` : undefined}
        className={`${trigger} ${variant === 'icon' ? 'size-8 max-md:size-10' : 'min-h-8 border border-(--control-border) px-3'}`}
      >
        <ShareIcon />
        {variant === 'button' ? 'Share' : null}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-popover
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-(--z-sheet) min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) rounded-lg border border-(--hairline) bg-surface-raised p-1"
        >
          <DropdownMenu.Item className={item} onSelect={() => void copy()}>
            Copy link
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <a href={xIntentUrl(market)} target="_blank" rel="noopener noreferrer">
              Post on X<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
