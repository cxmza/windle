---
title: Ship vs slash payouts
description: What the team, YES holders and NO holders receive when a windle promise ships or is slashed, and which payout details are still open.
---

:::caution[Design, subject to change]
The payout rules below are the current design intent. Fees, rounding and the exact slash distribution formula are
not decided.
:::

Every promise resolves one of two ways.

## Ship → collateral returned, YES paid

The condition holds at resolution.

| Party | Receives |
| --- | --- |
| Team | Its full collateral back. |
| YES holders | 1 unit per YES share. |
| NO holders | Nothing. NO shares are worth 0. |

## Slash → collateral slashed to NO holders

The condition does not hold at resolution.

| Party | Receives |
| --- | --- |
| Team | Nothing back. The collateral is gone. |
| YES holders | Nothing. YES shares are worth 0. |
| NO holders | 1 unit per NO share, **plus** the team's collateral, distributed among them. |

## A worked example (illustrative)

Not real numbers, not a real market. Suppose:

- the team locked collateral **C**;
- you hold **n** NO shares out of **N** NO shares outstanding at resolution;
- the slash distribution is pro rata to NO shares (one candidate rule, not final).

On a slash you would receive `n` from your shares, plus `C × n / N` from the collateral. On a ship you would receive 0.

With the same assumptions, a YES holder with **m** shares receives `m` on a ship and 0 on a slash.

## Payouts are claimed, not pushed

In the current design, payouts sit in program-controlled accounts after resolution and each holder claims their own.
Whether unclaimed funds ever expire is not decided.

## Open questions

- **Slash distribution rule.** Pro rata to NO shares at resolution is the simplest option. Alternatives weigh by time
  held or cost paid, to make last-minute NO buying less attractive once a miss is obvious.
- **No NO holders.** If nobody holds NO when a promise is slashed, where the collateral goes is undecided.
- **Fees.** Whether windle takes a fee on trades, collateral or payouts, and how much, is not decided. This page will
  list any fee once one is decided.
- **Team positions.** Limits on what the team's declared wallets can hold, see
  [Collateral → open questions](/concepts/collateral/#open-questions).
