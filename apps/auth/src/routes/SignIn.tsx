import { safeReturnTo } from '@windle/shared';
import { useSearchParams } from 'react-router';
import { BrandPanel } from '@/features/brand3d/BrandPanel';
import { announcement, headline, SignInPanel } from '@/features/signin/SignInPanel';
import { SigningPreview } from '@/features/signin/SigningPreview';
import { useSignIn } from '@/features/signin/use-sign-in';
import { APP_URL, DOCS_URL, WEB_URL } from '@/lib/env';
import { useSignInWallets } from '@/wallets/use-sign-in-wallets';

const tinyLink =
  'rounded-xs underline-offset-4 transition-colors duration-(--dur-fast) hover:text-foreground hover:underline';

export function SignIn() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('return_to'));
  const target = returnTo ?? APP_URL;
  const wallets = useSignInWallets();
  const { state, signIn, signOut } = useSignIn(target);
  const message = announcement(state);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-background lg:grid lg:grid-cols-[55fr_45fr]">
      {/* Sign-in comes first in the DOM (focus order); the brand panel is decorative: a header block on mobile, the left half on desktop. */}
      <main className="bg-aura relative flex flex-col justify-center px-(--gutter) pt-12 pb-28 lg:col-start-2 lg:row-start-1 lg:min-h-dvh lg:px-12 lg:py-16 xl:px-20">
        <div className="flex w-full max-w-95 flex-col gap-8 lg:mx-auto">
          <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.88] tracking-[-0.03em] text-balance lg:text-6xl">
            {headline(state)}
          </h1>

          {/* Screen-reader announcements; the visible panel is not a live region so it is not read twice. */}
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {message}
          </p>
          {returnTo ? <p className="sr-only">Returns to {new URL(returnTo).host}</p> : null}

          <section aria-label="Sign in with a wallet">
            <SignInPanel state={state} wallets={wallets} target={target} onPick={signIn} onSignOut={signOut} />
          </section>
        </div>

        <nav
          aria-label="Legal"
          className="absolute inset-x-(--gutter) bottom-6 text-xs leading-4 text-muted-foreground lg:inset-x-12 xl:inset-x-20"
        >
          <div className="flex w-full max-w-95 items-center gap-2 lg:mx-auto">
            <SigningPreview className={`${tinyLink} min-h-6 underline`} />
            <span aria-hidden="true">·</span>
            <a className={tinyLink} href={`${DOCS_URL}/legal/terms/`}>
              Terms
            </a>
            <span aria-hidden="true">·</span>
            <a className={tinyLink} href={`${DOCS_URL}/legal/privacy/`}>
              Privacy
            </a>
          </div>
        </nav>

        <a
          href={WEB_URL}
          className="absolute right-(--gutter) bottom-14 rounded-xs font-mono text-xs text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground lg:fixed lg:right-6 lg:bottom-6"
        >
          <span aria-hidden="true">←</span> windle.fun
        </a>
      </main>

      <BrandPanel className="order-first lg:order-none lg:col-start-1 lg:row-start-1" />
    </div>
  );
}
