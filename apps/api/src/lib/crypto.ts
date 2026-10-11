import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 9562 UUIDv7: 48-bit unix ms timestamp, version 7, variant 10, 74 random bits. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 256-bit opaque session token, base64url (43 chars). */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 128-bit SIWS nonce, hex (SIWS requires >= 8 alphanumerics). */
export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison (hashes first so length differences do not leak either). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
