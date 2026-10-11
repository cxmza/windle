import type { Wallet } from '@wallet-standard/base';
import { useEffect, useReducer } from 'react';
import { type AuthApi, authApi } from '@/lib/api';
import { redirectTo } from '@/lib/navigate';
import { initialSignInState, type SignInState, signInReducer } from './machine';
import { performSiws, SignInError } from './siws';

/** Success is shown briefly (so the person sees it worked), then we leave. */
export const REDIRECT_DELAY_MS = 900;

export interface UseSignInResult {
  state: SignInState;
  signIn(wallet: Wallet): void;
  reset(): void;
  signOut(): void;
}

/** Drives the sign-in screen: session check on mount, the SIWS handshake, the redirect, sign out. */
export function useSignIn(target: string, api: AuthApi = authApi): UseSignInResult {
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);

  // Already signed in? Sync with the server once on mount. An unreachable api just means "not signed in" here;
  // the real error shows when the person actually tries to sign in.
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .getSession(ctrl.signal)
      .then((s) => dispatch({ type: 'session-checked', address: s.authenticated ? s.address : null }))
      .catch(() => {
        if (!ctrl.signal.aborted) dispatch({ type: 'session-checked', address: null });
      });
    return () => ctrl.abort();
  }, [api]);

  // After success: a short beat, then leave.
  const succeeded = state.phase === 'success';
  useEffect(() => {
    if (!succeeded) return;
    const id = window.setTimeout(() => redirectTo(target), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [succeeded, target]);

  function signIn(wallet: Wallet) {
    dispatch({ type: 'start', wallet: wallet.name });
    performSiws(wallet, { api, onStep: (step) => dispatch({ type: 'step', step }) }).then(
      (res) => dispatch({ type: 'succeeded', address: res.session.address }),
      (e: unknown) =>
        dispatch({
          type: 'failed',
          failure:
            e instanceof SignInError ? e.failure : { kind: 'wallet', message: 'Something went wrong. Try again.' },
        }),
    );
  }

  function signOut() {
    dispatch({ type: 'sign-out-started' });
    api.logout().then(
      () => dispatch({ type: 'sign-out-done' }),
      () => dispatch({ type: 'sign-out-failed' }),
    );
  }

  return { state, signIn, reset: () => dispatch({ type: 'reset' }), signOut };
}
