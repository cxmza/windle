---
title: Promise
description: A windle promise is a condition over Solana state plus a deadline. What makes a good promise, what is out of scope, and examples.
---

:::caution[Design, subject to change]
The exact promise format is not final. The structure below is the current design.
:::

A **promise** is the thing a windle market is about. It has three parts:

| Part | What it is | Example |
| --- | --- | --- |
| **Statement** | The human-readable claim, shown in the interface. | "Mainnet by Dec 1." |
| **Condition** | A check a program can run against Solana accounts. This is what actually decides the outcome. | "The program account at a declared address exists and is executable on mainnet." |
| **Deadline** | When the condition is evaluated. | "Dec 1, 00:00 UTC", expressed against the cluster clock. |

The statement is for people. The condition is for the program. If the two ever read differently, **the condition
wins**: that is what resolves the market. Always read the condition before you trade.

## What makes a promise valid

A condition has to be **onchain-verifiable**: given the accounts named in the promise, a program can compute true or
false without asking anyone. In practice that means conditions about things like:

- **Deployment**: a program exists at a declared address and is executable.
- **Locks and vesting**: a declared token account still holds at least a declared amount, or is still owned by a
  declared lock program.
- **Treasury flows**: a declared account's balance of a declared token is at or above a threshold.

Each of these is a pattern, not a shipped feature. Which conditions windle supports at launch is not decided yet.

## Out of scope

Anything that needs judgement or offchain data:

- "Launch a great v2", "partner with a top exchange", "grow the community".
- Website uptime, GitHub activity, follower counts, audit reports.
- Prices from offchain sources.

windle's design has no oracle vote and no dispute process, so a condition that cannot be evaluated from chain state
cannot be resolved fairly. Such promises are rejected rather than resolved by someone's opinion.

## Fixed once trading starts

In the current design, a promise's condition, accounts and deadline cannot be changed after its market opens. A
promise that could be edited mid-market would let the team move the goalposts after traders have priced it.

## Writing a good condition

- **Name exact accounts.** Not "our program", but the address.
- **Make it monotone where you can.** "Balance at or above N at the deadline" is checkable; "never dropped below N
  during the period" needs history a program cannot read after the fact. See [Resolution](/concepts/resolution/#current-state-not-history).
- **Leave a margin on time.** Deadlines are compared with the Solana cluster clock, which can differ from wall-clock
  time by a small amount.
