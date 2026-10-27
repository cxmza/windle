import type { ApiMarket, ApiTrade, MarketSide } from '@windle/shared';
import { useState } from 'react';
import { errorMessage } from '../errors';
import { useBalance, usePredictActions, useQuote } from '../hooks';
import { parseAmount, problemText, sanitizeAmount } from './trade-copy';

/** The buy half of the trade panel as a hook: typed amount, live quote, the same validation, the same api call. */
export function useBuyOrder(market: ApiMarket, side: MarketSide) {
  const balanceOrNull = useBalance();
  const balance = balanceOrNull ?? 0;
  const { buy: mutation } = usePredictActions();
  const [raw, setRaw] = useState('');
  const amount = parseAmount(raw);
  const quote = useQuote(market, side, amount);

  const typed = raw.trim() !== '';
  const problem = typed ? quote.problem : null;
  const problemMessage = problem
    ? problemText(problem, { tab: 'buy', market, side, balancePts: balance, owned: 0 })
    : null;
  const blocked = !typed || quote.problem !== null || amount <= 0;
  const error = mutation.error ? errorMessage(mutation.error, 'The trade could not be placed. Try again.') : null;

  return {
    raw,
    amount,
    balance,
    balanceLoading: balanceOrNull === null,
    typed,
    quote: typed ? quote.quote : null,
    invalid: problem !== null,
    problemMessage,
    error,
    blocked,
    pending: mutation.isPending,
    setAmount(next: string) {
      mutation.reset();
      setRaw(sanitizeAmount(next));
    },
    submit(onBought?: (trade: ApiTrade) => void) {
      if (blocked || mutation.isPending) return;
      mutation.mutate(
        { market, side, amountPts: amount },
        {
          onSuccess: (res) => {
            setRaw('');
            onBought?.(res.trade);
          },
        },
      );
    },
  };
}
