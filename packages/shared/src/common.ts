import { z } from './zod.ts';

/** Base58 Solana address (ed25519 public key, 32 bytes -> 32..44 chars). Shape check only; the api decodes it. */
export const SolanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'not a base58 Solana address')
  .describe('Base58 Solana address (ed25519 public key).')
  .meta({ examples: ['7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy'] });
export type SolanaAddress = z.infer<typeof SolanaAddress>;

/**
 * Error body for every non-2xx response: `{ error: { code, message, requestId? } }`.
 * `code` is a stable machine-readable string (see ApiErrorCode); `message` is for humans and may change.
 * `requestId` echoes the X-Request-Id header so a user-visible error can be matched to server logs.
 */
export const ApiError = z
  .object({
    error: z.object({
      code: z
        .string()
        .describe('Stable machine-readable code. Branch on this, never on `message`.')
        .meta({ examples: ['unauthenticated'] }),
      message: z
        .string()
        .describe('Human-readable explanation; may change.')
        .meta({ examples: ['Sign in first'] }),
      requestId: z
        .string()
        .optional()
        .describe('Echo of the `X-Request-Id` response header, for support and log lookup.')
        .meta({ examples: ['5b0e8f7a-3f61-4d2b-9a7c-1c2d3e4f5a6b'] }),
    }),
  })
  .describe('Error envelope used by every non-2xx response.');
export type ApiError = z.infer<typeof ApiError>;

/** Error codes the api emits. Clients branch on these, never on `message`. */
export const API_ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'invalid_json',
  'unsupported_media_type',
  'payload_too_large',
  'unauthenticated',
  'csrf_rejected',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'rate_limited',
  'nonce_invalid',
  'siws_message_mismatch',
  'siws_expired',
  'signature_invalid',
  'provider_disabled',
  'not_implemented',
  'service_unavailable',
  'internal_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
