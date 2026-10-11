---
title: Market & pricing
description: How a windle YES/NO market prices a promise, LMSR explained simply, and a worked example with clearly illustrative numbers.
---

:::caution[Design, subject to change]
The market mechanism is not final. The interactive demo on the landing page uses the **LMSR** described below, and it
is the leading candidate. All numbers on this page are **illustrative**, taken from that demo. They are not real
markets, prices or parameters.
:::

## YES and NO shares

Every promise gets a two-outcome market:

- A **YES share** pays **1 unit** if the promise ships.
- A **NO share** pays **1 unit** if the promise is slashed.
- The losing side's shares pay nothing.

So the price of a YES share, somewhere between 0 and 1, reads as the market's probability that the promise is kept.
A YES price of 0.72 is the market saying "about 72%". On slash, NO holders also receive the team's collateral; see
[payouts](/concepts/payouts/).

## Who you trade against: LMSR

Small markets rarely have enough buyers and sellers for an order book. An **automated market maker** solves that: you
always trade against a formula, so there is always a price.

The **logarithmic market scoring rule (LMSR)** is a market maker designed for prediction markets. It keeps track of
how many YES shares (`qYes`) and NO shares (`qNo`) have been sold, and charges according to a cost function:

```text
cost(qYes, qNo) = b · ln( e^(qYes / b) + e^(qNo / b) )

price of YES    = e^(qYes / b) / ( e^(qYes / b) + e^(qNo / b) )
price of NO     = 1 − price of YES
```

To buy shares you pay the **difference in cost** before and after your trade. In plain words:

- **Buying YES pushes the YES price up**, buying NO pushes it down. Prices always sum to 1.
- **`b` is the liquidity.** A bigger `b` means each trade moves the price less, and the market maker needs a bigger
  subsidy.
- **The subsidy is bounded.** For a two-outcome market opened at 50/50, the market maker can lose at most
  `b · ln 2` in total, whatever traders do. Who funds that subsidy in windle is not decided.
- **You pay the average price across your trade**, not the price before it. Larger trades pay more per share.

## Worked example (illustrative)

These numbers come from the landing page demo: liquidity `b = 50`, a market opened at YES = 0.72, and a stake of 10
demo units per trade. Demo units are not a real currency.

| Trade, from the opening state | Shares received | Average price paid | YES price after |
| --- | --- | --- | --- |
| Buy YES with 10 | ≈ 13.41 YES | ≈ 0.746 | 0.72 → ≈ 0.771 |
| Buy NO with 10 | ≈ 29.13 NO | ≈ 0.343 | 0.72 → ≈ 0.589 |

Reading the first row: 10 units buys about 13.41 YES shares. If the promise ships, they pay 13.41 units (10 back plus
about 3.41). If it's slashed, they pay 0 and the 10 units are gone.

The NO trade moves the price more. NO started cheap (0.28), so the same 10 units buys more than twice as many shares,
and an LMSR price responds to the number of shares sold (`qYes − qNo`), not to the amount spent.

## Reading a price

- A price is a market opinion, not a forecast with a guarantee. Thin markets can be moved by a single trader.
- The team can trade too (with limits still being designed, see
  [Collateral → open questions](/concepts/collateral/#open-questions)). A team buying YES on its own promise is a
  signal, but not proof.
- Prices can move suddenly near the deadline as onchain evidence appears, for example when a program gets deployed.
