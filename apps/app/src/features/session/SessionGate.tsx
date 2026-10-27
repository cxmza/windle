import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WindleMark } from '@windle/brand';
import { type ReactNode, useEffect, useRef } from 'react';
import { Outlet } from 'react-router';
import { ApiUnavailable } from '@/components/ApiUnavailable';
import { api } from '@/lib/api';
import { AUTH_URL } from '@/lib/env';
import { redirectTo } from '@/lib/navigate';
import { AppShell } from '@/shell/AppShell';
import { PageFrame } from '@/shell/PageFrame';
import { portfolioQuery, predictKeys } from '../predict/queries';
import { loginUrl } from './login-url';
import { sessionQuery } from './queries';
import { type AuthedSession, SessionContext } from './session-context';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-(--gutter) py-12">
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

function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear();
      redirectTo(AUTH_URL);
    },
  });
}

function SignedInLayout({ session }: { session: AuthedSession }) {
  const logout = useSignOut();
  const queryClient = useQueryClient();
  const address = useRef(session.address);
  useEffect(() => {
    if (address.current !== session.address) {
      address.current = session.address;
      queryClient.removeQueries({ queryKey: predictKeys.all });
    }
    void queryClient.prefetchQuery(portfolioQuery());
  }, [queryClient, session.address]);
  const signOut = {
    run: () => logout.mutate(),
    pending: logout.isPending || logout.isSuccess,
    failed: logout.isError,
  };

  return (
    <SessionContext value={{ session, signOut }}>
      <AppShell>
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
 *  - authenticated: the sidebar shell + the matched page
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
        <PageFrame>
          <span role="status" className="sr-only">
            Checking your session…
          </span>
          <PageSkeleton />
        </PageFrame>
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
