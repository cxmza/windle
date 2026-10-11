import { SolanaSignIn, type SolanaSignInFeature, type SolanaSignInInput } from '@solana/wallet-standard-features';
import type { Wallet } from '@wallet-standard/base';
import { vi } from 'vitest';

export const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

type SignInImpl = (input: SolanaSignInInput) => Promise<{ signedMessage: Uint8Array; signature: Uint8Array }>;

/** A Wallet Standard wallet whose `solana:signIn` is a vi.fn. Default: signs with deterministic bytes. */
export function fakeWallet(name = 'Phantom', impl?: SignInImpl) {
  const signIn = vi.fn(
    impl ??
      (async () => ({
        signedMessage: new TextEncoder().encode('oauth.windle.fun wants you to sign in'),
        signature: new Uint8Array(64).fill(7),
      })),
  );
  const feature: SolanaSignInFeature[typeof SolanaSignIn] = {
    version: '1.0.0',
    signIn: async (...inputs) => {
      const outs = [];
      for (const input of inputs) {
        const r = await signIn(input ?? {});
        outs.push({ account: { address: ADDRESS } as never, ...r });
      }
      return outs;
    },
  };
  const wallet = {
    version: '1.0.0',
    name,
    icon: 'data:image/svg+xml;base64,PHN2Zy8+',
    chains: ['solana:mainnet'],
    accounts: [],
    features: { [SolanaSignIn]: feature },
  } as unknown as Wallet;
  return { wallet, signIn };
}

export const nonceBody = {
  nonce: 'a1b2c3d4e5',
  input: {
    domain: 'oauth.windle.fun',
    statement: 'Sign in to windle',
    uri: 'https://oauth.windle.fun',
    version: '1',
    chainId: 'mainnet',
    nonce: 'a1b2c3d4e5',
    issuedAt: '2026-10-11T12:00:00Z',
    expirationTime: '2026-10-11T12:05:00Z',
  },
};

export const verifyBody = {
  session: {
    authenticated: true,
    userId: '4f7f4a0e-6a58-4d8c-9d63-0a8a9a2f6a11',
    address: ADDRESS,
    expiresAt: '2026-11-11T12:00:00Z',
  },
  me: {
    id: '4f7f4a0e-6a58-4d8c-9d63-0a8a9a2f6a11',
    createdAt: '2026-10-11T12:00:00Z',
    wallets: [{ chain: 'solana', address: ADDRESS, linkedAt: '2026-10-11T12:00:00Z' }],
  },
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
