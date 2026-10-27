import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { Button } from '@/components/Button';
import { CopyButton } from '@/components/CopyButton';
import { meQuery } from '@/features/session/queries';
import { SessionContext } from '@/features/session/session-context';
import { formatDate, formatDateTime, shortAddress } from '@/lib/format';
import { usePref } from './prefs';

const valueClass = 'text-sm text-foreground tabular-nums';

function NoSession() {
  return <span className="text-sm text-muted-foreground">Not signed in</span>;
}

export function WalletsList() {
  const ctx = use(SessionContext);
  const me = useQuery(meQuery());

  if (me.isPending) {
    return (
      <>
        <span role="status" className="sr-only">
          Loading wallets…
        </span>
        <div aria-hidden="true" className="h-12 rounded-lg bg-muted/60 motion-safe:animate-pulse" />
      </>
    );
  }
  if (me.isError) return <ApiUnavailable error={me.error} onRetry={() => me.refetch()} retrying={me.isFetching} />;
  if (me.data.wallets.length === 0) {
    return <p className="text-sm text-muted-foreground">No wallets are linked to this account yet.</p>;
  }
  return (
    <ul className="flex flex-col rounded-lg border border-(--hairline)">
      {me.data.wallets.map((w) => (
        <li
          key={`${w.chain}:${w.address}`}
          className="flex items-center gap-3 border-b border-(--hairline) py-2 pr-2 pl-3 last:border-b-0"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-mono text-sm break-all">{w.address}</span>
            <span className="text-xs text-muted-foreground">
              Solana · linked {formatDate(w.linkedAt)}
              {w.address === ctx?.session.address ? ' · this session' : ''}
            </span>
          </div>
          <CopyButton value={w.address} label={`Copy wallet address ${w.address.slice(0, 4)}`} />
        </li>
      ))}
    </ul>
  );
}

export function SignedInAs() {
  const ctx = use(SessionContext);
  if (!ctx) return <NoSession />;
  const { address } = ctx.session;
  return (
    <>
      <span title={address} className="font-mono text-sm">
        {shortAddress(address)}
      </span>
      <CopyButton value={address} label="Copy signed-in address" />
    </>
  );
}

export function SessionExpires() {
  const ctx = use(SessionContext);
  const clock = usePref('clock');
  if (!ctx) return <NoSession />;
  return <span className={valueClass}>{formatDateTime(ctx.session.expiresAt, clock)}</span>;
}

export function MemberSince() {
  const me = useQuery(meQuery());
  if (me.isPending)
    return <span aria-hidden="true" className="h-4 w-24 rounded-md bg-muted/60 motion-safe:animate-pulse" />;
  if (me.isError) return <span className="text-sm text-muted-foreground">Unavailable</span>;
  return <span className={valueClass}>{formatDate(me.data.createdAt)}</span>;
}

export function SignOutControl() {
  const ctx = use(SessionContext);
  if (!ctx) return <NoSession />;
  const { signOut } = ctx;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="secondary" onClick={signOut.run} disabled={signOut.pending} className="min-h-9 px-4">
        {signOut.pending ? 'Signing out…' : 'Sign out'}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {signOut.failed ? 'Could not sign out. Check your connection and try again.' : ''}
      </p>
    </div>
  );
}
