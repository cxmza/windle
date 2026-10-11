import type { SignInFailure, SignInStep } from './siws';

/** Everything the sign-in screen can be showing. "No wallet" / "choose wallet" are derived from the wallet list in `idle`. */
export type SignInState =
  | { phase: 'checking' }
  | { phase: 'idle' }
  | { phase: 'signing'; wallet: string; step: SignInStep }
  | { phase: 'rejected'; wallet: string }
  | { phase: 'error'; wallet: string; failure: Exclude<SignInFailure, { kind: 'rejected' }> }
  | { phase: 'success'; address: string }
  | { phase: 'signed-in'; address: string; signingOut: boolean; signOutFailed: boolean };

export type SignInAction =
  | { type: 'session-checked'; address: string | null }
  | { type: 'start'; wallet: string }
  | { type: 'step'; step: SignInStep }
  | { type: 'failed'; failure: SignInFailure }
  | { type: 'succeeded'; address: string }
  | { type: 'reset' }
  | { type: 'sign-out-started' }
  | { type: 'sign-out-done' }
  | { type: 'sign-out-failed' };

export const initialSignInState: SignInState = { phase: 'checking' };

/** Pure transitions. Events that make no sense in the current phase are ignored, not thrown. */
export function signInReducer(state: SignInState, action: SignInAction): SignInState {
  switch (action.type) {
    case 'session-checked':
      if (state.phase !== 'checking') return state;
      return action.address
        ? { phase: 'signed-in', address: action.address, signingOut: false, signOutFailed: false }
        : { phase: 'idle' };
    case 'start':
      // Only from a resting phase: not while checking, signing, succeeded, or already signed in.
      if (state.phase !== 'idle' && state.phase !== 'rejected' && state.phase !== 'error') return state;
      return { phase: 'signing', wallet: action.wallet, step: 'nonce' };
    case 'step':
      return state.phase === 'signing' ? { ...state, step: action.step } : state;
    case 'failed':
      if (state.phase !== 'signing') return state;
      return action.failure.kind === 'rejected'
        ? { phase: 'rejected', wallet: state.wallet }
        : { phase: 'error', wallet: state.wallet, failure: action.failure };
    case 'succeeded':
      return state.phase === 'signing' ? { phase: 'success', address: action.address } : state;
    case 'reset':
      return state.phase === 'rejected' || state.phase === 'error' ? { phase: 'idle' } : state;
    case 'sign-out-started':
      return state.phase === 'signed-in' ? { ...state, signingOut: true, signOutFailed: false } : state;
    case 'sign-out-done':
      return state.phase === 'signed-in' ? { phase: 'idle' } : state;
    case 'sign-out-failed':
      return state.phase === 'signed-in' ? { ...state, signingOut: false, signOutFailed: true } : state;
  }
}
