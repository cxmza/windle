const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const AMOUNT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TWO_DIGITS = new Intl.NumberFormat('en-US', { minimumIntegerDigits: 2, useGrouping: false });

/** 72 -> "72¢" */
export const formatCents = (cents: number) => `${WHOLE.format(cents)}¢`;
/** 1234.5 -> "1,234.50" (demo USDC amounts, shares) */
export const formatAmount = (n: number) => AMOUNT.format(n);
/** 50000 -> "50,000" */
export const formatWhole = (n: number) => WHOLE.format(n);
/** 4 -> "04" (countdown digits) */
export const pad2 = (n: number) => TWO_DIGITS.format(n);
