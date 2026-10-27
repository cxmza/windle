export type LookupErrorCode = 'invalid_tweet_url' | 'tweet_not_found' | 'x_feed_unavailable' | 'x_rate_limited';

export interface LookupFailure {
  readonly code: LookupErrorCode;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: LookupFailure };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: LookupErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});

export class LookupError extends Error {
  readonly code: LookupErrorCode;

  constructor(error: LookupFailure) {
    super(error.message);
    this.name = 'LookupError';
    this.code = error.code;
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new LookupError(result.error);
  return result.value;
}
