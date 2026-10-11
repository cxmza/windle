import { SolanaSignIn, type SolanaSignInFeature, type SolanaSignInInput } from '@solana/wallet-standard-features';
import type { Wallet } from '@wallet-standard/base';
import type { SiwsVerifyResponse } from '@windle/shared';
import bs58 from 'bs58';
import { ApiRequestError, type AuthApi } from '@/lib/api';

type SignInMethod = SolanaSignInFeature[typeof SolanaSignIn];

export type SignInStep = 'nonce' | 'signature' | 'verify';

/**
 * Why a sign-in attempt ended without a session. `rejected` is the user's own choice (not an error);
 * everything else carries a message that says what to do next.
 */
export type SignInFailure =
  | { kind: 'rejected' }
  | { kind: 'network'; message: string }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'server'; message: string }
  | { kind: 'verify'; message: string }
  | { kind: 'wallet'; message: string };

export class SignInError extends Error {
  readonly failure: SignInFailure;

  constructor(failure: SignInFailure) {
    super(failure.kind === 'rejected' ? 'Request rejected in the wallet.' : failure.message);
    this.name = 'SignInError';
    this.failure = failure;
  }
}

/** Wallets disagree on how they report "user said no": EIP-1193 code 4001, or a message. */
export function isUserRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === 4001) return true;
  const text = [
    'name' in error ? String(error.name) : '',
    'message' in error ? String(error.message) : '',
    'cause' in error && typeof error.cause === 'object' && error.cause !== null && 'message' in error.cause
      ? String(error.cause.message)
      : '',
  ].join(' ');
  return /reject|denied|declin|cancel|closed|dismiss/i.test(text);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Map an API/transport failure onto copy the person can act on. */
export function describeApiFailure(error: unknown, phase: 'nonce' | 'verify'): SignInFailure {
  if (error instanceof ApiRequestError) {
    if (error.kind === 'network') {
      return {
        kind: 'network',
        message: 'We could not reach the windle servers. Check your connection and try again.',
      };
    }
    if (error.status === 429) {
      return { kind: 'rate-limited', message: 'Too many attempts. Wait a minute, then try again.' };
    }
    if (error.kind === 'http' && error.status !== null && error.status >= 500) {
      return { kind: 'server', message: 'Our server had a problem. Nothing was signed. Try again in a moment.' };
    }
    if (error.kind === 'schema') {
      return { kind: 'server', message: 'The server answered in a way we did not expect. Try again in a moment.' };
    }
    if (phase === 'verify') {
      return {
        kind: 'verify',
        message: 'The signature could not be verified. The request may have expired. Try again.',
      };
    }
  }
  return { kind: 'server', message: 'Something went wrong while starting sign-in. Try again.' };
}

export interface PerformSiwsOptions {
  api: Pick<AuthApi, 'getNonce' | 'verify'>;
  onStep?: (step: SignInStep) => void;
}

/**
 * The whole SIWS handshake for one wallet: nonce -> `solana:signIn` -> verify (the session cookie is set by the
 * verify response). Throws SignInError; never returns a half-result.
 */
export async function performSiws(wallet: Wallet, { api, onStep }: PerformSiwsOptions): Promise<SiwsVerifyResponse> {
  const feature = wallet.features[SolanaSignIn] as SignInMethod | undefined;
  if (!feature)
    throw new SignInError({ kind: 'wallet', message: `${wallet.name} does not support Sign In With Solana.` });

  onStep?.('nonce');
  const issued = await api.getNonce().catch((e: unknown) => {
    throw new SignInError(describeApiFailure(e, 'nonce'));
  });

  onStep?.('signature');
  let output: Awaited<ReturnType<SignInMethod['signIn']>>[number] | undefined;
  try {
    // The api issues every field; the wallet shows them to the person unchanged.
    [output] = await feature.signIn(issued.input as SolanaSignInInput);
  } catch (e) {
    if (isUserRejection(e)) throw new SignInError({ kind: 'rejected' });
    throw new SignInError({
      kind: 'wallet',
      message: `${wallet.name} could not complete the request. Unlock it and try again.`,
    });
  }
  if (!output) throw new SignInError({ kind: 'wallet', message: `${wallet.name} returned no signature. Try again.` });

  onStep?.('verify');
  return api
    .verify({
      nonce: issued.nonce,
      address: output.account.address,
      signedMessage: toBase64(output.signedMessage),
      signature: bs58.encode(output.signature),
    })
    .catch((e: unknown) => {
      throw new SignInError(describeApiFailure(e, 'verify'));
    });
}
