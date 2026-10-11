import type { Wallet } from '@wallet-standard/base';
import { Button, IconBadge, LinkButton } from '@/components/Button';
import { shortAddress } from '@/lib/format';
import type { SignInState } from './machine';
import { SocialSignIn } from './SocialSignIn';
import type { SignInStep } from './siws';

const INSTALL_LINKS = [
  { name: 'Phantom', href: 'https://phantom.com/download' },
  { name: 'Backpack', href: 'https://backpack.app/download' },
  { name: 'Solflare', href: 'https://solflare.com/download' },
] as const;

const STEP_COPY: Record<SignInStep, string> = {
  nonce: 'Preparing your sign-in request',
  signature: 'Waiting for your signature',
  verify: 'Verifying the signature',
};

/** Plain-text twin of what the panel shows, announced politely to screen readers (visible UI is not a live region). */
export function announcement(state: SignInState): string {
  switch (state.phase) {
    case 'checking':
      return 'Checking your session.';
    case 'idle':
      return '';
    case 'signing':
      return state.step === 'signature'
        ? `Confirm the sign-in request in ${state.wallet}.`
        : `${STEP_COPY[state.step]}.`;
    case 'rejected':
      return `Request declined in ${state.wallet}. Nothing was signed.`;
    case 'error':
      return state.failure.message;
    case 'success':
      return `Signed in as ${shortAddress(state.address)}. Redirecting.`;
    case 'signed-in':
      return `You are signed in as ${shortAddress(state.address)}.`;
  }
}

/** The title of the column, derived from the state. */
export function headline(state: SignInState): string {
  if (state.phase === 'signed-in') return 'Welcome back';
  if (state.phase === 'success') return 'You’re in';
  return 'Sign in';
}

const mutedLine = 'mt-2 text-sm leading-5 text-muted-foreground';

function Arrow({ children = '→' }: { children?: string }) {
  return (
    <span aria-hidden="true" className="text-xl leading-none">
      {children}
    </span>
  );
}

function WalletIcon({ wallet, variant }: { wallet: Wallet; variant: 'primary' | 'secondary' }) {
  return (
    <IconBadge variant={variant}>
      <img src={wallet.icon} alt="" width={24} height={24} className="size-6 rounded-full" />
    </IconBadge>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="spinner" />;
}

interface SignInPanelProps {
  state: SignInState;
  wallets: readonly Wallet[];
  target: string;
  onPick: (wallet: Wallet) => void;
  onSignOut: () => void;
}

// TODO(motion): cross-fade between panel states (idle -> signing -> success).
export function SignInPanel({ state, wallets, target, onPick, onSignOut }: SignInPanelProps) {
  if (state.phase === 'checking') {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className="h-14 rounded-full bg-foreground/10 motion-safe:animate-pulse" />
        <div className="h-14 rounded-full bg-foreground/6 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (state.phase === 'signed-in') {
    return (
      <div className="flex flex-col gap-2">
        <p className="mb-4 truncate font-mono text-base" title={state.address}>
          {shortAddress(state.address, 6, 6)}
        </p>
        <LinkButton href={target}>
          <span className="flex-1">Continue to app</span>
          <Arrow />
        </LinkButton>
        <Button variant="secondary" onClick={onSignOut} disabled={state.signingOut}>
          {state.signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
        {state.signOutFailed ? <p className={mutedLine}>Couldn’t sign out. Try again.</p> : null}
      </div>
    );
  }

  if (state.phase === 'success') {
    return (
      <Button aria-busy="true" aria-label="Redirecting">
        <Spinner />
        <span className="flex-1">Redirecting…</span>
      </Button>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {INSTALL_LINKS.map((w, i) => (
          <LinkButton
            key={w.name}
            href={w.href}
            target="_blank"
            rel="noopener noreferrer"
            variant={i === 0 ? 'primary' : 'secondary'}
          >
            <span className="flex-1 truncate">Install {w.name}</span>
            <Arrow>↗</Arrow>
            <span className="sr-only">(opens in a new tab)</span>
          </LinkButton>
        ))}
        <p className={mutedLine}>Installed? Unlock it and reload.</p>
        <SocialSignIn target={target} locked={false} />
      </div>
    );
  }

  const signing = state.phase === 'signing' ? state : null;
  let note: string | null = null;
  if (state.phase === 'rejected') note = 'Signature rejected.';
  else if (state.phase === 'error') {
    note = state.failure.kind === 'network' ? 'Couldn’t reach windle. Try again.' : 'Couldn’t sign in. Try again.';
  }

  return (
    <div className="flex flex-col gap-2">
      {wallets.map((w, i) => {
        const variant = i === 0 ? 'primary' : 'secondary';
        if (signing && signing.wallet === w.name) {
          return (
            <Button
              key={w.name}
              variant={variant}
              inset="lead"
              aria-busy="true"
              aria-disabled="true"
              aria-label={`Signing in with ${w.name}`}
            >
              <Spinner />
              <span className="flex-1 truncate">
                {signing.step === 'signature' ? 'Check your wallet…' : 'Signing in…'}
              </span>
            </Button>
          );
        }
        return (
          <Button
            key={w.name}
            variant={variant}
            inset="lead"
            disabled={signing !== null}
            onClick={() => onPick(w)}
            aria-label={`Sign in with ${w.name}`}
          >
            <WalletIcon wallet={w} variant={variant} />
            <span className="flex-1 truncate">{w.name}</span>
            <Arrow />
          </Button>
        );
      })}
      {note ? <p className={mutedLine}>{note}</p> : null}
      <SocialSignIn target={target} locked={signing !== null} />
    </div>
  );
}
