---
title: Sign in with Solana
description: How windle sign-in works with Sign-In With Solana (SIWS), exactly what your wallet signs, and why that signature cannot move your funds.
---

windle accounts use **Sign-In With Solana (SIWS)**: you prove you control a wallet by signing a short text message.
No password, no email required. Sign-in happens on [oauth.windle.fun](https://oauth.windle.fun).

:::tip[The one rule]
Signing in **never** requires a transaction. If anything on a windle domain asks you to approve a _transaction_ in order
to sign in, reject it.
:::

## What happens

1. You open [app.windle.fun](https://app.windle.fun). Without a session it sends you to oauth.windle.fun, remembering
   where to send you back. Only `*.windle.fun` addresses are accepted as a return target.
2. oauth.windle.fun lists the wallets installed in your browser that support SIWS (for example Phantom, Backpack or
   Solflare).
3. You pick one. The windle API issues a one-time **nonce** and the exact sign-in fields.
4. Your wallet shows you the message and asks you to sign it.
5. The API rebuilds the same message from what it issued, checks the signature against your address, checks the
   domain, nonce and expiry, and marks the nonce as used.
6. You get a session and are sent back to where you started.

## What you sign

Your wallet displays a plain-text message in the SIWS format. Its shape (the exact statement wording may differ):

```text
oauth.windle.fun wants you to sign in with your Solana account:
<your wallet address>

Sign in to windle

URI: https://oauth.windle.fun
Version: 1
Chain ID: mainnet
Nonce: <random one-time value>
Issued At: <timestamp>
Expiration Time: <timestamp>
```

Check two things before you approve:

- **The first line names `oauth.windle.fun`.** A message for another domain is not a windle sign-in. SIWS lets
  wallets compare that domain with the site asking for the signature and warn you on a mismatch.
- **It is text, not a transaction.** There are no amounts, no token approvals, no programs to call.

## Why it cannot move your funds

Moving funds on Solana requires your signature on a **transaction**: a binary message that lists instructions such as
"transfer X tokens to Y", which validators execute. A SIWS signature covers the text above and nothing else.

- The text is not a valid transaction, so the network has nothing to execute.
- The signature is checked once by the windle API and is useless afterwards: the nonce is single-use and the message
  expires.
- Your private key never leaves your wallet. windle never receives it and cannot sign anything on your behalf.

## Your session

After a successful sign-in, the API sets a session cookie:

| Property | Value | What it means |
| --- | --- | --- |
| Name | `wl_session` | |
| Domain | `.windle.fun` | Shared by windle's own subdomains, not sent to other sites. |
| `HttpOnly` | yes | Page scripts can't read it. |
| `Secure` | yes | Only sent over HTTPS. |
| `SameSite` | `Lax` | Not sent on most cross-site requests. |

The cookie holds a random opaque token. The session itself is stored on windle's servers and has an expiry (the API
reports it as `expiresAt`). **Signing out** deletes the session on the server, not only the cookie.

A session lets windle know which wallet you are. It cannot sign transactions: any action that moves funds will always
come back to your wallet for approval.

## Other sign-in methods

Email magic links, X and Google sign-in are planned and present in the code, but **disabled**. Today, SIWS is the only
way to sign in.

## Troubleshooting

- **"No wallets found"**: install a Solana wallet that supports Sign-In With Solana, or enable it for this site.
- **"Expired" or "nonce" errors**: the message is only valid for a short time and only once. Start again.
- **Signed in on the wrong wallet**: sign out, switch accounts in your wallet, sign in again.
