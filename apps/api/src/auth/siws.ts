import { ed25519 } from '@noble/curves/ed25519.js';
import { parseSiwsMessage, type SiwsMessageFields, type SiwsSignInInput } from '@windle/shared';
import bs58 from 'bs58';

/** Clock skew tolerated between the api and the wallet's view of `issuedAt` (the api wrote it, so this is small). */
export const CLOCK_SKEW_MS = 60_000;

export function buildSignInInput(
  opts: { domain: string; uri: string; statement: string; chainId: SiwsSignInInput['chainId']; ttlSeconds: number },
  nonce: string,
  now: Date,
): SiwsSignInInput {
  return {
    domain: opts.domain,
    statement: opts.statement,
    uri: opts.uri,
    version: '1',
    chainId: opts.chainId,
    nonce,
    issuedAt: now.toISOString(),
    expirationTime: new Date(now.getTime() + opts.ttlSeconds * 1000).toISOString(),
  };
}

export type SiwsFailure =
  | { code: 'bad_request'; message: string }
  | { code: 'siws_message_mismatch'; message: string }
  | { code: 'siws_expired'; message: string }
  | { code: 'signature_invalid'; message: string };

/** Decodes the wire encodings and parses the signed text. Pure; runs before the nonce is touched. */
export function decodeSignedMessage(
  signedMessageB64: string,
): { ok: true; bytes: Uint8Array; fields: SiwsMessageFields } | { ok: false; failure: SiwsFailure } {
  const bytes = new Uint8Array(Buffer.from(signedMessageB64, 'base64'));
  if (bytes.length === 0 || bytes.length > 4096)
    return { ok: false, failure: { code: 'bad_request', message: 'signedMessage must be 1..4096 bytes' } };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, failure: { code: 'bad_request', message: 'signedMessage is not valid UTF-8' } };
  }
  const fields = parseSiwsMessage(text);
  if (!fields) return { ok: false, failure: { code: 'bad_request', message: 'signedMessage is not a SIWS message' } };
  return { ok: true, bytes, fields };
}

/**
 * Compares what the wallet signed with what the api issued for that nonce.
 *
 * - Every field the api issued must be present with the issued value (the message is parsed, not re-serialised,
 *   so field formatting is the wallet's business). `Chain ID` may carry the CAIP-2 style `solana:` prefix.
 * - Fields the api did not issue but a wallet may add are tolerated: `Request ID` and `Resources` are ignored
 *   (nothing is granted from them); `Not Before` only narrows the window, so it is enforced.
 * - The time window is checked against the api's clock.
 */
export function checkMessageAgainstIssued(
  fields: SiwsMessageFields,
  issued: SiwsSignInInput,
  address: string,
  now: Date,
): SiwsFailure | null {
  const expected: Record<string, string | undefined> = {
    domain: issued.domain,
    address,
    statement: issued.statement,
    uri: issued.uri,
    version: issued.version,
    nonce: issued.nonce,
    issuedAt: issued.issuedAt,
    expirationTime: issued.expirationTime,
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = fields[key as keyof SiwsMessageFields];
    if (actual !== value)
      return { code: 'siws_message_mismatch', message: `signed ${key} does not match the issued one` };
  }
  if (fields.chainId !== issued.chainId && fields.chainId !== `solana:${issued.chainId}`)
    return { code: 'siws_message_mismatch', message: 'signed chainId does not match the issued one' };

  const t = now.getTime();
  if (Date.parse(issued.expirationTime) <= t) return { code: 'siws_expired', message: 'sign-in request expired' };
  if (Date.parse(issued.issuedAt) > t + CLOCK_SKEW_MS)
    return { code: 'siws_message_mismatch', message: 'sign-in request is issued in the future' };
  if (fields.notBefore !== undefined) {
    const notBefore = Date.parse(fields.notBefore);
    if (Number.isNaN(notBefore)) return { code: 'siws_message_mismatch', message: 'signed notBefore is not a date' };
    if (notBefore > t + CLOCK_SKEW_MS)
      return { code: 'siws_message_mismatch', message: 'sign-in request is not valid yet' };
  }
  return null;
}

/** ed25519 over the exact signed bytes with the wallet's public key (= base58-decoded address). */
export function verifySignature(message: Uint8Array, signatureB58: string, address: string): boolean {
  try {
    const publicKey = bs58.decode(address);
    const signature = bs58.decode(signatureB58);
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
