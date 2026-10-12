import type { ReactNode } from 'react';
import { useAuthedSession } from '@/features/session/session-context';
import { TopBar } from '../markets/TopBar';

export function ProjectsFrame({ title, children }: { title: string; children: ReactNode }) {
  const { session, signOut } = useAuthedSession();
  return (
    <div className="relative min-h-dvh bg-nebula">
      <title>{`${title} — windle`}</title>
      <TopBar address={session.address} onSignOut={signOut.run} signingOut={signOut.pending} />

      {signOut.failed ? (
        <div
          role="alert"
          className="fixed inset-x-(--gutter) top-[calc(var(--topbar-height)+var(--nav-offset)*2)] z-(--z-dock) mx-auto max-w-md rounded-3xl border border-(--hairline) bg-(--panel-surface) px-5 py-3 text-sm"
        >
          Could not sign out. Check your connection and try again.
        </div>
      ) : null}

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-(--gutter) pt-[calc(var(--topbar-height)+var(--nav-offset)+3rem)] pb-[calc(var(--chrome-bottom)+4rem)] outline-none"
      >
        {children}
      </main>
    </div>
  );
}
