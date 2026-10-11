---
title: Collateral
description: What collateral is in windle, who holds it, what happens to it on ship or slash, and the open questions about sizing and self-betting.
---

:::caution[Design, subject to change]
No collateral asset, minimum, or fee has been decided. Numbers on the landing page are illustrative.
:::

**Collateral** is what a team puts behind a promise: funds they lose if they don't deliver. It is what makes a windle
promise different from a post on X.

## How it is held

- The team deposits collateral into an account controlled by the windle program, not by the team and not by windle's
  developers.
- It stays locked until the promise resolves. There is no early withdrawal in the current design.
- The amount is public onchain, so traders can see exactly what the team stands to lose before they trade.

## What happens to it

| Outcome | Collateral |
| --- | --- |
| **Ship** (condition met) | Returned to the team. |
| **Slash** (condition missed) | Distributed to NO holders. |

The exact distribution rule on slash (for example, pro rata to NO shares held at resolution) is part of
[payouts](/concepts/payouts/) and is not final.

## Why it matters for the price

Collateral does two things for traders:

1. **It is a signal.** A team that locks a large amount relative to its means is telling the market it expects to
   deliver. A token amount alone is not enough: the same number means different things for different teams.
2. **It is what NO holders receive on a slash.** In the current design, NO holders get the collateral on top of what
   the market pays winning shares, which changes what a NO position is worth.

## Open questions

These are known gaps in the design, listed so nobody mistakes them for solved:

- **Self-betting.** A team could buy NO on its own promise and then deliberately miss. That is only unprofitable if
  their NO winnings, including their share of the slashed collateral, stay below the collateral they lose. Options
  under consideration include caps on positions held by the team's declared wallets and sizing collateral against
  open interest. Wallets are pseudonymous, so no rule here is airtight.
- **Collateral asset.** Which tokens are accepted (for example, a stablecoin versus the team's own token) is open. A
  team's own token as collateral is weaker: its value can fall with the very failure it is meant to cover.
- **Minimums and fees.** Not decided.
