---
title: Introduction
description: What windle is, the problem it targets, and the incentive argument behind it. Pre-launch; design subject to change.
---

:::caution[Pre-launch]
windle is not live. This documentation describes the protocol as it is designed today. Mechanics, parameters and
names can change before launch. Nothing here is an offer, a promise of returns, or financial advice.
:::

## What windle is

windle is a protocol on Solana for **promises with collateral**.

1. A team makes a promise that a program can check onchain, with a deadline: _"mainnet by Dec 1"_, _"the vesting
   account stays untouched"_, _"revenue into our treasury reaches N"_.
2. The team **locks collateral** behind it: funds they lose if they don't deliver.
3. A **YES/NO market** opens on the promise. Anyone can buy YES if they believe the team will deliver, or NO if they
   don't. The price reads as the market's odds.
4. At the deadline, **the chain decides**. A program reads the relevant onchain state and resolves the promise one of
   two ways:
   - **Ship**: the condition is met. Collateral returns to the team, YES holders are paid.
   - **Slash**: the condition is missed. The collateral is slashed to NO holders.

## Why

In crypto, roadmaps and "soon" cost nothing to publish. A post on X carries no consequence if it turns out wrong, and
nobody can price how likely it is to come true.

windle turns a claim into something with a cost and a price:

- **Cost**: the team puts money behind its word. Missing has a measurable consequence.
- **Price**: the market aggregates what traders believe about the claim into one number, updated continuously.
- **Verdict**: the outcome is read from the chain, so nobody has to trust a committee, a vote or the team's own
  announcement.

## The incentive argument

In most prediction markets, insiders are a problem: someone who knows the outcome early can trade against everyone
else.

In a windle market, the party with the most influence over the outcome is the **team** itself. The design aims for a
market where the team's only profitable move is to deliver:

- If they ship, they get their collateral back, and any YES they hold pays.
- If they miss, they lose the collateral.

This holds only if the collateral outweighs anything the team could gain from betting against itself. Making that
true by construction (for example, limits on the team's own NO positions, or collateral sized against open interest)
is an [open design question](/concepts/collateral/#open-questions), not a solved one.

## What windle is not

- **Not an oracle network.** windle only accepts promises whose outcome a program can read from chain state. Claims
  that need a human to judge them ("ship a great product") are out of scope. See
  [Resolution](/concepts/resolution/).
- **Not a guarantee.** A slashed promise means the team missed; it does not make anyone whole beyond what the
  collateral and the market pay out.
- **Not affiliated** with Solana, the Solana Foundation or pump.fun. windle is built on Solana and is designed to work
  with pump.fun tokens; that is a technical statement, not a partnership.

## Where to go next

- [How it works](/how-it-works/): the full lifecycle in one page.
- [Concepts](/concepts/promise/): each piece in detail, including what is still undecided.
- [Risk disclosure](/legal/risk/): read this before putting money into any market.
