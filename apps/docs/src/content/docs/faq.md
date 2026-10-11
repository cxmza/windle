---
title: FAQ
description: Short answers about windle, the Solana protocol for promises with collateral. Status, token, fees, resolution, risks and sign-in.
---

## Is windle live?

No. windle is pre-launch. There are no live markets and no windle programs holding funds. The product app currently
offers sign-in only. Follow the [changelog](/changelog/) for what ships.

## Is there a windle token?

No token has been announced, here or on [windle.fun](https://www.windle.fun). Treat any "windle token" you are offered
as unofficial unless it is announced in these docs.

## What can a promise be about?

Only things a program can check from Solana state: a program deployed at an address, tokens still sitting in a lock,
a treasury balance above a threshold. Anything needing human judgement or offchain data is out of scope. See
[Promise](/concepts/promise/).

## Who decides whether a promise was kept?

The windle program, reading chain state after the deadline. There is no vote, no oracle and no dispute process in the
design. See [Resolution](/concepts/resolution/).

## What does the team get out of it?

A credible, priced commitment: putting collateral behind a claim is a stronger signal than announcing it. If they
deliver, they get the collateral back.

## Can the team bet against itself?

That is the main attack the design has to prevent. It only pays if the team's NO winnings beat the collateral it
loses. Limits on team positions are being designed and are not final. See
[Collateral → open questions](/concepts/collateral/#open-questions).

## What do I get if I'm right?

Each winning share pays 1 unit. On a slash, NO holders also share the team's collateral. Exact rules, including fees,
are not final. See [payouts](/concepts/payouts/).

## Can I lose money?

Yes. A share on the losing side is worth nothing, and you can lose everything you put into a position. Smart contract
bugs, mis-specified conditions and thin markets add further risk. Read the [risk disclosure](/legal/risk/).

## What are the fees?

Not decided. Fees will be listed in [payouts](/concepts/payouts/) once they are.

## Is windle available in my country?

Prediction markets are regulated, or restricted, in many jurisdictions. Availability by country has not been decided
yet. It is your responsibility to know whether you may participate where you live.

## Does signing in give windle access to my wallet?

No. Sign-in is a text message signature, not a transaction, and cannot move funds. See
[Sign in](/guides/sign-in/#why-it-cannot-move-your-funds).

## Which wallets work?

Solana wallets that support Sign-In With Solana through the Wallet Standard, for example Phantom, Backpack and
Solflare.

## Is windle affiliated with Solana or pump.fun?

No. windle is built on Solana and designed to work with pump.fun tokens. That describes technology, not a
partnership or endorsement.

## Is the code audited?

Not yet. No audit has been completed. The [changelog](/changelog/) will say when one is.
