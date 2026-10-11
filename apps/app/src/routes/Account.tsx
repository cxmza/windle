import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { Button } from '@/components/Button';
import { CopyButton } from '@/components/CopyButton';
import { PageHeading } from '@/components/PageHeading';
import { meQuery } from '@/features/session/queries';
import { useAuthedSession } from '@/features/session/session-context';
import { formatDate, formatDateTime } from '@/lib/format';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="glass flex flex-col gap-4 rounded-3xl p-5 sm:p-6">
      <h2 id={id} className="font-display text-base font-bold lowercase tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function WalletsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <div className="h-16 rounded-xl bg-muted/60 motion-safe:animate-pulse" />
    </div>
  );
}

export function Account() {
  const { session, signOut } = useAuthedSession();
  const me = useQuery(meQuery());

  return (
    <>
      <PageHeading title="Account" lede="Your wallets and this session." />

      <Section id="wallets" title="Wallets">
        {me.isPending ? (
          <>
            <span role="status" className="sr-only">
              Loading wallets…
            </span>
            <WalletsSkeleton />
          </>
        ) : me.isError ? (
          <ApiUnavailable error={me.error} onRetry={() => me.refetch()} retrying={me.isFetching} />
        ) : me.data.wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wallets are linked to this account yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {me.data.wallets.map((w) => (
              <li
                key={`${w.chain}:${w.address}`}
                className="flex items-center gap-3 rounded-xl border border-border-strong/25 bg-surface/40 py-2 pr-2 pl-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-mono text-sm break-all">{w.address}</span>
                  <span className="text-caption text-muted-foreground">
                    Solana · linked {formatDate(w.linkedAt)}
                    {w.address === session.address ? ' · this session' : ''}
                  </span>
                </div>
                <CopyButton value={w.address} label={`Copy wallet address ${w.address.slice(0, 4)}`} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="session" title="This session">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Signed in as</dt>
          <dd className="font-mono break-all">{session.address}</dd>
          <dt className="text-muted-foreground">Expires</dt>
          <dd>{formatDateTime(session.expiresAt)}</dd>
          {me.data ? (
            <>
              <dt className="text-muted-foreground">Member since</dt>
              <dd>{formatDate(me.data.createdAt)}</dd>
            </>
          ) : null}
        </dl>
        <div className="flex flex-col items-start gap-2">
          <Button variant="secondary" onClick={signOut.run} disabled={signOut.pending}>
            {signOut.pending ? 'Signing out…' : 'Sign out'}
          </Button>
          <p role="status" className="text-caption text-muted-foreground">
            {signOut.failed ? 'Could not sign out. Check your connection and try again.' : ''}
          </p>
        </div>
      </Section>
    </>
  );
}
