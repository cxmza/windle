import { SolanaAddress } from './common.ts';
import { z } from './zod.ts';

/** Session cookie: opaque random token, the session itself lives in Redis. Domain=.windle.fun HttpOnly Secure SameSite=Lax. */
export const SESSION_COOKIE = 'wl_session';

/**
 * Sign-In With Solana input, as passed to the wallet's `solana:signIn` feature (SolanaSignInInput) and rebuilt by the
 * api when it verifies. The api issues every field; the client must not change any of them.
 */
export const SiwsSignInInput = z
  .object({
    domain: z
      .string()
      .min(1)
      .describe('Host the user is signing in to (RFC 3986 authority).')
      .meta({ examples: ['oauth.windle.fun'] }),
    statement: z
      .string()
      .optional()
      .describe('Human-readable line the wallet shows.')
      .meta({ examples: ['Sign in to windle'] }),
    uri: z
      .url()
      .describe('Origin of the sign-in page.')
      .meta({ examples: ['https://oauth.windle.fun'] }),
    version: z.literal('1').describe('SIWS message version.'),
    chainId: z.enum(['mainnet', 'devnet', 'testnet']).describe('Solana cluster the sign-in is bound to.'),
    /** SIWS: at least 8 alphanumeric characters. */
    nonce: z
      .string()
      .regex(/^[A-Za-z0-9]{8,}$/)
      .describe('Single-use server nonce (alphanumeric, at least 8 characters).')
      .meta({ examples: ['k7Q2mX9vT4pL8wRz'] }),
    issuedAt: z.iso.datetime().describe('When the nonce was issued (ISO 8601, UTC).'),
    expirationTime: z.iso.datetime().describe('After this instant the nonce can no longer be redeemed.'),
  })
  .describe('SolanaSignInInput: pass it unchanged to the wallet `solana:signIn` feature.');
export type SiwsSignInInput = z.infer<typeof SiwsSignInInput>;

/** GET (or POST, no body) /v1/auth/siws/nonce -> 200. Pass `input` unchanged to the wallet `solana:signIn`. */
export const SiwsNonce = z
  .object({
    nonce: SiwsSignInInput.shape.nonce,
    input: SiwsSignInInput,
  })
  .describe('A fresh sign-in input. The nonce is redeemable once, until `input.expirationTime`.');
export type SiwsNonce = z.infer<typeof SiwsNonce>;

/**
 * POST /v1/auth/siws/verify body: the wallet's SolanaSignInOutput, encoded for JSON.
 * `signedMessage` is base64 (arbitrary UTF-8 bytes), `signature` is base58 (64-byte ed25519 signature, Solana convention).
 */
export const SiwsVerifyRequest = z
  .object({
    nonce: SiwsSignInInput.shape.nonce,
    address: SolanaAddress.describe('Wallet that signed; must equal the address inside the signed text.'),
    signedMessage: z
      .base64()
      .describe('`SolanaSignInOutput.signedMessage`: the exact bytes the wallet signed, base64-encoded.'),
    signature: z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/, 'not a base58 signature')
      .describe('`SolanaSignInOutput.signature`: the 64-byte ed25519 signature, base58-encoded.')
      .meta({
        examples: ['5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'],
      }),
  })
  .describe('The wallet `SolanaSignInOutput`, encoded for JSON.');
export type SiwsVerifyRequest = z.infer<typeof SiwsVerifyRequest>;

export const Wallet = z
  .object({
    chain: z.literal('solana').describe('Chain of the wallet. Only Solana today.'),
    address: SolanaAddress,
    linkedAt: z.iso.datetime().describe('When the wallet was linked to the account (ISO 8601, UTC).'),
  })
  .describe('A wallet linked to the account.');
export type Wallet = z.infer<typeof Wallet>;

/** GET /v1/me -> 200 */
export const Me = z
  .object({
    id: z
      .uuid()
      .describe('Stable user id.')
      .meta({ examples: ['0b8f3c0e-6a51-4d47-9a8e-2f4c1d7b9e10'] }),
    createdAt: z.iso.datetime().describe('Account creation time (ISO 8601, UTC).'),
    wallets: z.array(Wallet).describe('Linked wallets, oldest first.'),
  })
  .describe('The signed-in user.');
export type Me = z.infer<typeof Me>;

/** GET /v1/auth/session -> 200. Anonymous is a normal answer, not a 401, so apps can branch without error handling. */
export const Session = z
  .discriminatedUnion('authenticated', [
    z
      .object({
        authenticated: z.literal(true),
        userId: z.uuid().describe('Id of the signed-in user.'),
        address: SolanaAddress.describe('Wallet the session was started with.'),
        expiresAt: z.iso.datetime().describe('Sliding expiry; every authenticated call pushes it forward.'),
      })
      .describe('Signed in.'),
    z.object({ authenticated: z.literal(false) }).describe('Anonymous: no cookie, or the session ended.'),
  ])
  .describe('Session state. Anonymous is a normal 200, not an error.');
export type Session = z.infer<typeof Session>;

/** POST /v1/auth/siws/verify -> 200 (the session cookie is set on the same response). */
export const SiwsVerifyResponse = z
  .object({
    session: Session.options[0],
    me: Me,
  })
  .describe('Signed in. The `wl_session` cookie is set on this response.');
export type SiwsVerifyResponse = z.infer<typeof SiwsVerifyResponse>;

/** Sign-in methods. Only `siws` is live; the others exist as config flags and answer 501 `provider_disabled`. */
export const AUTH_PROVIDERS = ['siws', 'email', 'x', 'google', 'telegram', 'discord'] as const;
export const AuthProvider = z.enum(AUTH_PROVIDERS).describe('Sign-in method id.');
export type AuthProvider = z.infer<typeof AuthProvider>;

/** GET /v1/auth/providers -> 200: which sign-in methods the auth UI should offer. */
export const AuthProviders = z
  .object({
    providers: z.array(
      z.object({
        id: AuthProvider,
        enabled: z.boolean().describe('Whether this server accepts the method right now.'),
      }),
    ),
  })
  .describe('Sign-in methods and whether each is enabled.');
export type AuthProviders = z.infer<typeof AuthProviders>;
