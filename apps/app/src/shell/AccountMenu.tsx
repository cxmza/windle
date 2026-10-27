import type { ApiImage } from '@windle/shared';
import { DropdownMenu } from 'radix-ui';
import { type ComponentType, type ReactNode, use, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AnimatedIconProps } from '@/components/icons/icon-base';
import {
  CopyIcon,
  LogoutIcon,
  SettingsIcon,
  SquarePenIcon,
  TrophyIcon,
  WalletIcon,
  XIcon,
} from '@/components/icons/lucide-animated';
import { type IconTriggerProps, useIconTrigger } from '@/components/icons/use-icon-trigger';
import { SolanaMark } from '@/components/SolanaMark';
import { useToast } from '@/components/Toast';
import { AvatarDialog } from '@/features/media/AvatarDialog';
import { useMyAvatar, useSetAvatar } from '@/features/media/hooks';
import { UserAvatar } from '@/features/media/UserAvatar';
import { mediaErrorMessage } from '@/features/media/upload';
import { useBalance, useLeaderboard } from '@/features/predict/hooks';
import { Amount } from '@/features/predict/ui/Amount';
import { SessionContext } from '@/features/session/session-context';
import { DOCS_URL } from '@/lib/env';
import { shortAddress } from '@/lib/format';
import { BookIcon, CheckIcon, ChevronUpDownIcon, ExternalIcon, GlobeIcon, UserIcon } from './icons';
import { RailTip } from './RailTip';
import { useSettingsHref } from './settings';

type Props = { rail: boolean; onNavigate?: (() => void) | undefined };

type CopyStatus = 'idle' | 'copied' | 'failed';

type Icon = ComponentType<AnimatedIconProps>;

const row =
  'grid h-9 w-full cursor-default grid-cols-[1.25rem_minmax(0,1fr)_1rem] items-center gap-x-3 rounded-md px-2 text-sm text-foreground outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-(--hover) max-md:h-11';

const iconCell = 'flex size-5 items-center justify-center text-muted-foreground';

const separator = 'mx-2 my-1 h-px bg-(--hairline)';

const triggerClass =
  'flex min-w-0 items-center rounded-md border border-transparent text-sm text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:bg-(--selected) [@media(hover:hover)]:enabled:hover:bg-(--hover)';

const triggerSize = (rail: boolean) => (rail ? 'h-12 w-10 justify-center px-1' : 'h-12 w-full gap-2.5 px-3');

type RowProps = {
  Icon: Icon;
  children: ReactNode;
  end?: ReactNode;
  render: (handlers: IconTriggerProps, body: ReactNode) => ReactNode;
};

function Row({ Icon, children, end, render }: RowProps) {
  const [active, handlers] = useIconTrigger();
  return render(
    handlers,
    <>
      <span className={iconCell}>
        <Icon active={active} />
      </span>
      <span className="min-w-0 truncate text-left">{children}</span>
      {end ? <span className="justify-self-end text-muted-foreground">{end}</span> : null}
    </>,
  );
}

function LinkRow({
  to,
  Icon,
  onNavigate,
  children,
}: {
  to: string;
  Icon: Icon;
  onNavigate?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <Row
      Icon={Icon}
      render={(handlers, body) => (
        <DropdownMenu.Item asChild>
          <Link to={to} onClick={onNavigate} {...handlers} className={row}>
            {body}
          </Link>
        </DropdownMenu.Item>
      )}
    >
      {children}
    </Row>
  );
}

function ExternalRow({ href, Icon, children }: { href: string; Icon: Icon; children: ReactNode }) {
  return (
    <Row
      Icon={Icon}
      end={<ExternalIcon />}
      render={(handlers, body) => (
        <DropdownMenu.Item asChild>
          <a href={href} target="_blank" rel="noopener noreferrer" {...handlers} className={row}>
            {body}
          </a>
        </DropdownMenu.Item>
      )}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Row>
  );
}

function ActionRow({
  Icon,
  disabled,
  keepOpen = true,
  onSelect,
  children,
}: {
  Icon: Icon;
  disabled?: boolean;
  /** Rows that report back in place keep the menu open; rows that open a dialog or finish the job close it. */
  keepOpen?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Row
      Icon={Icon}
      render={(handlers, body) => (
        <DropdownMenu.Item
          {...handlers}
          className={row}
          disabled={disabled}
          onSelect={(e) => {
            if (keepOpen) e.preventDefault();
            onSelect();
          }}
        >
          {body}
        </DropdownMenu.Item>
      )}
    >
      {children}
    </Row>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-sm tabular-nums">{children}</dd>
    </div>
  );
}

function Identity({ address, short, avatar }: { address: string; short: string; avatar: ApiImage | null }) {
  const balance = useBalance();
  const rank = useLeaderboard().data?.me?.rank ?? null;
  return (
    <DropdownMenu.Label className="flex flex-col gap-2.5 px-2 pt-2 pb-1.5">
      <span className="flex items-center gap-2.5">
        <UserAvatar address={address} image={avatar} className="size-8" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-mono text-sm leading-4 font-medium text-foreground" title={address}>
            {short}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs leading-4 text-muted-foreground">
            <SolanaMark className="h-2.5 w-3" />
            Solana
          </span>
        </span>
      </span>
      <dl className="grid grid-cols-2 divide-x divide-(--hairline) rounded-md border border-(--hairline) bg-surface">
        <Stat label="Balance">{balance === null ? '—' : <Amount value={balance} format="whole" />}</Stat>
        <Stat label="Rank">{rank === null ? '—' : `#${rank}`}</Stat>
      </dl>
    </DropdownMenu.Label>
  );
}

export function AccountMenu({ rail, onNavigate }: Props) {
  const ctx = use(SessionContext);
  const settingsHref = useSettingsHref('general');
  const toast = useToast();
  const balance = useBalance();
  const [copy, setCopy] = useState<CopyStatus>('idle');
  const avatar = useMyAvatar();
  const setAvatar = useSetAvatar();
  const [avatarOpen, setAvatarOpen] = useState(false);

  useEffect(() => {
    if (copy === 'idle') return;
    const id = window.setTimeout(() => setCopy('idle'), 1800);
    return () => window.clearTimeout(id);
  }, [copy]);

  if (!ctx) {
    return (
      <button type="button" disabled aria-label="Account, loading" className={`${triggerClass} ${triggerSize(rail)}`}>
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-(--hairline) bg-surface-raised text-muted-foreground">
          <UserIcon />
        </span>
        {rail ? null : <span aria-hidden="true" className="h-3 w-24 rounded-md bg-muted motion-safe:animate-pulse" />}
      </button>
    );
  }

  const { address } = ctx.session;
  const { signOut } = ctx;
  const short = shortAddress(address);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopy('copied');
      toast('Address copied');
    } catch {
      setCopy('failed');
      toast('Could not copy the address');
    }
  }

  function removeAvatar() {
    setAvatar.mutate(null, {
      onSuccess: () => toast('Avatar removed'),
      onError: (error) => toast(mediaErrorMessage(error, 'Could not remove the avatar')),
    });
  }

  return (
    <>
      <DropdownMenu.Root>
        <RailTip label={short} active={rail}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              data-settings-return
              aria-label={rail ? `Account menu, ${short}` : undefined}
              className={`${triggerClass} ${triggerSize(rail)}`}
            >
              <span className="relative inline-flex size-8 shrink-0">
                <UserAvatar address={address} image={avatar} className="size-8" />
                <span className="absolute -right-0.5 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-surface ring-2 ring-surface">
                  <SolanaMark className="h-2 w-2.5" />
                </span>
              </span>
              {rail ? null : (
                <>
                  <span
                    data-sidebar-label="mount"
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                  >
                    <span className="w-full truncate font-mono leading-4" title={address}>
                      {short}
                    </span>
                    <span className="w-full truncate font-mono text-xs leading-4 tabular-nums text-muted-foreground">
                      {balance === null ? '—' : <Amount value={balance} format="whole" />}
                    </span>
                  </span>
                  <span
                    data-sidebar-label="mount"
                    className="flex size-5 items-center justify-center text-muted-foreground"
                  >
                    <ChevronUpDownIcon />
                  </span>
                </>
              )}
            </button>
          </DropdownMenu.Trigger>
        </RailTip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side={rail ? 'right' : 'top'}
            align={rail ? 'end' : 'start'}
            sideOffset={8}
            collisionPadding={8}
            data-popover
            className={`z-(--z-pencil) ${rail ? 'w-60' : 'w-(--radix-dropdown-menu-trigger-width)'} max-w-[calc(100vw-1rem)] origin-(--radix-dropdown-menu-content-transform-origin) rounded-lg border border-(--control-border) bg-(--panel-surface) p-1`}
          >
            <Identity address={address} short={short} avatar={avatar} />
            <DropdownMenu.Separator className={separator} />
            <LinkRow to="/portfolio" Icon={WalletIcon} onNavigate={onNavigate}>
              Portfolio
            </LinkRow>
            <LinkRow to="/leaderboard" Icon={TrophyIcon} onNavigate={onNavigate}>
              Leaderboard
            </LinkRow>
            <DropdownMenu.Separator className={separator} />
            <ActionRow Icon={SquarePenIcon} keepOpen={false} onSelect={() => setAvatarOpen(true)}>
              Change avatar
            </ActionRow>
            {avatar ? (
              <ActionRow Icon={XIcon} keepOpen={false} disabled={setAvatar.isPending} onSelect={removeAvatar}>
                Remove avatar
              </ActionRow>
            ) : null}
            <DropdownMenu.Separator className={separator} />
            <ActionRow Icon={copy === 'copied' ? CheckIcon : CopyIcon} onSelect={() => void copyAddress()}>
              {copy === 'copied' ? 'Address copied' : copy === 'failed' ? 'Could not copy' : 'Copy address'}
            </ActionRow>
            <ExternalRow href={`https://solscan.io/account/${address}`} Icon={GlobeIcon}>
              View on Solscan
            </ExternalRow>
            <DropdownMenu.Separator className={separator} />
            <LinkRow to={settingsHref} Icon={SettingsIcon} onNavigate={onNavigate}>
              Settings
            </LinkRow>
            <ExternalRow href={DOCS_URL} Icon={BookIcon}>
              Docs
            </ExternalRow>
            <DropdownMenu.Separator className={separator} />
            <ActionRow Icon={LogoutIcon} disabled={signOut.pending} onSelect={signOut.run}>
              {signOut.pending ? 'Signing out…' : signOut.failed ? 'Sign out failed, try again' : 'Sign out'}
            </ActionRow>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <AvatarDialog open={avatarOpen} onOpenChange={setAvatarOpen} />
    </>
  );
}
