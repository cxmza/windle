---
title: Resolution & oracles
description: How a windle promise resolves at the deadline from Solana state alone, why there is no oracle vote, and the limits of that approach.
---

:::caution[Design, subject to change]
The resolution program is not built yet. This page describes the design and its known limits.
:::

At the deadline, **the chain decides**. A promise resolves from Solana state alone: no oracle votes, no disputes, no
committee.

## How resolution works

1. The deadline passes, as measured by the Solana cluster clock.
2. Anyone can submit the resolution transaction. It does not have to be the team or windle.
3. The program loads the accounts named in the promise's condition and evaluates it.
4. The result is final: **ship** if the condition holds, **slash** if it doesn't. Payouts open.

Because the program only accepts the accounts the promise declared, a resolver cannot swap in different accounts to
change the result.

## Why no oracle

An oracle is someone, or some network, who reports an offchain fact onchain. Oracles are necessary for things like
"did it rain in Paris", but they add a party whose report can be wrong, late, bribed or disputed.

windle avoids that party entirely by only accepting promises that can be checked from chain state. The cost is scope:
many interesting claims can't be expressed this way and are therefore not windle promises. See
[Promise → out of scope](/concepts/promise/#out-of-scope).

## Current state, not history

A Solana program reads the **current** state of the accounts passed to it, at the moment the resolution transaction
runs. It cannot look up what an account held last week, or exactly at the deadline. That shapes which conditions work:

| Condition | Checkable? | Why |
| --- | --- | --- |
| "Program X is executable at the deadline" | Yes | Current state of one account. |
| "Treasury holds ≥ N at the deadline" | Yes | Current balance. |
| "Vesting account was never touched" | Only with help | Funds could leave and come back before the deadline. Workable if the tokens sit in a lock the program controls, or if windle records a snapshot when the promise opens. |
| "Revenue over the quarter ≥ N" | Only with help | Needs a cumulative counter onchain, for example a dedicated revenue account that only receives. |

Which of these patterns windle supports at launch is not decided.

Resolution also runs **some time after** the deadline, not at the exact instant. A condition that can flip in between
(a treasury balance that drops right after the deadline) needs either a condition that can't flip, or a mechanism that
freezes the relevant state at the deadline. How windle handles this is an open design question.

## Time

Deadlines are compared with the cluster clock that Solana programs read. It is derived from validator timestamps and
can differ from wall-clock time by a small amount. Promises should leave a margin rather than depend on the last few
seconds.

## What can still go wrong

Removing the oracle removes one class of risk, not all of them:

- **A badly written condition** can resolve differently from what the statement suggests. The condition is what
  counts.
- **Bugs in the windle programs** could resolve or pay out incorrectly. No audit has been completed; the
  [changelog](/changelog/) will say when one has.
- **Network issues** (congestion, outages) can delay resolution transactions, which matters for conditions that can
  change after the deadline (see above).
