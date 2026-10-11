---
title: For teams
description: How a team will make a windle promise. The flow is coming soon; this page describes the planned steps and what to prepare.
---

:::note[Coming soon]
Making a promise is not available yet. The product app at [app.windle.fun](https://app.windle.fun) currently offers
sign-in and an empty "My promises" dashboard. This page describes the planned flow so you can prepare.
:::

## The planned flow

1. **Sign in with your team wallet** on [oauth.windle.fun](https://oauth.windle.fun). See
   [Sign in](/guides/sign-in/).
2. **Write the promise**: a short statement for people ("Mainnet by Dec 1") and the condition the program will check,
   with the exact accounts involved. See [Promise](/concepts/promise/).
3. **Pick the deadline.** Leave a margin: resolution compares against the cluster clock.
4. **Lock collateral.** You sign one transaction that moves the collateral into the program's account. This is the
   first and only step that moves your funds.
5. **Market opens.** From here the condition, accounts and deadline are fixed.
6. **Ship.** At the deadline, anyone can trigger resolution. If the condition holds, your collateral comes back.

## What to prepare

- **The exact accounts.** Program IDs, token accounts or treasury addresses your condition depends on. Vague
  conditions will not be accepted.
- **A condition that cannot flip after the deadline**, or one that is safe to evaluate a little later. See
  [Resolution → current state, not history](/concepts/resolution/#current-state-not-history).
- **Collateral you can afford to lose.** A slash is final.

## Things you should know before committing

- You can trade on your own promise, within limits that are still being designed. Betting against yourself is the
  exact behaviour the protocol is meant to make unprofitable, and it will be constrained.
- A slash is public and permanent onchain. So is a ship.
- Read the [risk disclosure](/legal/risk/). It applies to teams as much as to traders.

Want to be early? Follow windle on X (link in the header) for launch news.
