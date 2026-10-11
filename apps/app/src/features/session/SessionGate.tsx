import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WindleMark } from '@windle/brand';
import { type ReactNode, useEffect } from 'react';
import { Outlet } from 'react-router';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { api } from '@/lib/api';
import { AUTH_URL } from '@/lib/env';
import { redirectTo } from '@/lib/navigate';
import { AppShell } from '@/shell/AppShell';
import { loginUrl } from './login-url';
import { sessionQuery } from './queries';
import { type AuthedSession, SessionContext } from './session-context';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="bg-aura flex min-h-dvh flex-col items-center justify-center gap-6 px-(--gutter) py-12">
      <WindleMark decorative size={56} />
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

/** Same silhouette as a real page (heading + one panel), so nothing jumps when the session resolves. */
function PageSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="h-10 w-2/3 max-w-sm rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="h-5 w-full max-w-prose rounded-md bg-muted/60 motion-safe:animate-pulse" />
      </div>
      <div className="h-64 rounded-3xl bg-muted/50 motion-safe:animate-pulse" />
    </div>
  );
}

function SignedInLayout({ session }: { session: AuthedSession }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear();
      redirectTo(AUTH_URL);
    },
  });

  return (
    <SessionContext
      value={{ session, signOut: { run: () => logout.mutate(), pending: logout.isPending, failed: logout.isError } }}
    >
      <AppShell
        address={session.address}
        onSignOut={() => logout.mutate()}
        signingOut={logout.isPending || logout.isSuccess}
        notice={
          logout.isError ? (
            <div
              role="alert"
              className="rounded-2xl border border-border-accent/50 bg-surface-navy/60 px-4 py-3 text-sm"
            >
              Could not sign out. Check your connection and try again.
            </div>
          ) : null
        }
      >
        <Outlet />
      </AppShell>
    </SessionContext>
  );
}

/**
 * Layout route for everything that needs a session.
 *  - pending: the real shell with placeholders (no layout shift)
 *  - api unreachable: friendly banner with retry
 *  - anonymous: leave for the sign-in app, with `return_to` set to where the person was
 *  - authenticated: shell + the matched page
 */
export function SessionGate() {
  const query = useQuery(sessionQuery());
  const data = query.data;
  const anonymous = data?.authenticated === false;

  useEffect(() => {
    if (anonymous) redirectTo(loginUrl());
  }, [anonymous]);

  if (!data) {
    if (query.isError) {
      return (
        <Centered>
          <ApiUnavailable error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
        </Centered>
      );
    }
    return (
      <AppShell>
        <span role="status" className="sr-only">
          Checking your session…
        </span>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!data.authenticated) {
    return (
      <Centered>
        <p role="status" className="text-center text-sm text-muted-foreground">
          Taking you to sign in…
        </p>
      </Centered>
    );
  }

  return <SignedInLayout session={data} />;
}
