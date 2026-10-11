---
title: Authentication endpoints
description: The windle API auth endpoints for Sign-In With Solana (SIWS), sessions, logout and the current user. Early and unstable.
---

:::caution[Early and unstable]
These endpoints can change. The [OpenAPI reference](https://api.windle.fun/reference) is the source of truth for
fields and status codes.
:::

The API uses [Sign-In With Solana](/guides/sign-in/) and an HttpOnly session cookie, `wl_session`. Browser apps on
`*.windle.fun` send it automatically with `credentials: 'include'`.

## Summary

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/auth/siws/nonce` | none | Start a sign-in: get a one-time nonce and the exact SIWS input to sign (`POST` is also accepted). |
| `POST /v1/auth/siws/verify` | none | Finish a sign-in: submit the wallet's signature. Sets the session cookie. |
| `GET /v1/auth/session` | optional | Who is signed in, if anyone. Anonymous is a normal `200`, not an error. |
| `POST /v1/auth/logout` | session | End the session on the server and clear the cookie. |
| `GET /v1/me` | session | The current user and their linked wallets. |

## Sign-in flow

1. `GET /v1/auth/siws/nonce` (`POST` also accepted, same response) returns a `nonce` and an `input` object: `domain`, `statement`, `uri`, `version`,
   `chainId`, `nonce`, `issuedAt`, `expirationTime`. Pass `input` unchanged to the wallet's `solana:signIn` feature
   (Wallet Standard).
2. The wallet returns the signed message, the signature and the address.
3. `POST /v1/auth/siws/verify` with:

   ```json
   {
     "nonce": "<nonce from step 1>",
     "address": "<base58 wallet address>",
     "signedMessage": "<base64 of the signed message bytes>",
     "signature": "<base58 ed25519 signature>"
   }
   ```

   The API rebuilds the message from the input it issued for that nonce, verifies the signature, consumes the nonce
   and responds with the session and the user. The `wl_session` cookie is set on the same response.

Don't modify any field of `input`: the API rebuilds the message from its own copy, so an edited field means a failed
verification.

## Response shapes

TypeScript view of the current contracts (the API validates them with zod; the reference has the full schema):

```ts
type Wallet = { chain: 'solana'; address: string; linkedAt: string /* ISO 8601 */ };

type Me = { id: string /* uuid */; createdAt: string; wallets: Wallet[] };

type Session =
  | { authenticated: true; userId: string; address: string; expiresAt: string }
  | { authenticated: false };

// POST /v1/auth/siws/verify -> 200
type SiwsVerifyResponse = { session: Extract<Session, { authenticated: true }>; me: Me };
```

## Checking the session from a browser app

```ts
const res = await fetch('https://api.windle.fun/v1/auth/session', { credentials: 'include' });
const session = await res.json();

if (!session.authenticated) {
  // send the user to sign in, returning here afterwards
  location.assign(`https://oauth.windle.fun/?return_to=${encodeURIComponent(location.href)}`);
}
```

`return_to` is only honoured for `*.windle.fun` addresses.
