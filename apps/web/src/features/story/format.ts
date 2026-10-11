/**
 * Formatters are created on first use, not at module evaluation: the first Intl.NumberFormat loads ICU number data
 * (measured ~33 ms of the main-bundle evaluation, mobile-4x), and only below-the-fold chapters format numbers.
 */
function lazyFormat(options: Intl.NumberFormatOptions): (n: number) => string {
  let nf: Intl.NumberFormat | null = null;
  return (n) => {
    nf ??= new Intl.NumberFormat('en-US', options);
    return nf.format(n);
  };
}

const WHOLE = { format: lazyFormat({ maximumFractionDigits: 0 }) };
const AMOUNT = { format: lazyFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
const TWO_DIGITS = { format: lazyFormat({ minimumIntegerDigits: 2, useGrouping: false }) };

/** 72 -> "72¢" */
export const formatCents = (cents: number) => `${WHOLE.format(cents)}¢`;
/** 1234.5 -> "1,234.50" (demo USDC amounts, shares) */
export const formatAmount = (n: number) => AMOUNT.format(n);
/** 50000 -> "50,000" */
export const formatWhole = (n: number) => WHOLE.format(n);
/** 4 -> "04" (countdown digits) */
export const pad2 = (n: number) => TWO_DIGITS.format(n);
