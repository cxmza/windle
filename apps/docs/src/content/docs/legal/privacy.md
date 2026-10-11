---
title: Privacy
description: Draft privacy notice for windle. What data the sign-in, API and websites process today, and why. Pending legal review.
---

:::danger[Draft, pending legal review]
This is a working draft. It has not been reviewed by a lawyer and is not in force. It describes what the services are
built to process today; the controller entity and contact are still to be determined.
:::

_Last updated: 2026-10-11 (draft)._

## What we process

| Data | Where it comes from | Why |
| --- | --- | --- |
| **Wallet address** | You, when you sign in | To identify your account. Wallet addresses are public on Solana. |
| **Account ID and creation time** | Generated at first sign-in | To link your wallet(s) to one account. |
| **Session token** | Generated at sign-in, stored in the `wl_session` cookie and on our servers | To keep you signed in. Deleted when you sign out or it expires. |
| **Sign-in records** | Each sign-in and sign-out | Security: detecting abuse and misuse of accounts. |
| **Request logs** (IP address, user agent, URL, time, status) | Every request to our servers | Operating, securing and debugging the services; rate limiting. |

We don't ask for your name, email or phone to use SIWS sign-in. Email and social sign-in are planned but disabled; if
they are enabled, this notice will be updated first.

## What we don't do

- We don't receive or store your private keys or seed phrase.
- We don't sell personal data.
- The docs site sets no tracking cookies and runs no third-party analytics.

## Service providers

Our sites are served through **Cloudflare**, which processes requests (including IP addresses) on our behalf. Our
servers are hosted with a third-party provider. **Full list of processors and their locations: to be determined.**

## Onchain data

Anything you do onchain (trades, collateral, claims) is public on Solana and permanent. We can't delete it, and
neither can anyone else.

## Retention

Sessions expire automatically. Database backups are kept for a limited rolling period. **Exact retention periods for
logs, sign-in records and backups: to be determined.**

## Your rights

Depending on where you live, you may have rights to access, correct, delete or export your data. **Contact for
requests: to be determined.**
