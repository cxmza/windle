import type { Me, SiwsSignInInput } from '@windle/shared';

/**
 * The api's whole persistence surface. Two narrow ports, each with a production adapter (Redis, Postgres via
 * Drizzle) and an in-memory fake for tests. Routes depend on these, never on a driver.
 */

export type RevokeReason = 'logout' | 'replaced' | 'expired';

/** A session as stored server-side, keyed by sha256(cookie token). */
export interface SessionRecord {
  userId: string;
  address: string;
  method: 'siws';
  /** Epoch ms. Hard ceiling: sliding renewals never extend a session past createdAt + absolute TTL. */
  createdAt: number;
}

/** Ephemeral, TTL-bound state (Redis in production). */
export interface EphemeralStore {
  /** Stores an issued SIWS input under its nonce. Returns false if the nonce already exists. */
  putNonce(nonce: string, input: SiwsSignInInput, ttlSeconds: number): Promise<boolean>;
  /** Atomically reads and deletes the nonce (single use). Null if unknown, expired or already used. */
  takeNonce(nonce: string): Promise<SiwsSignInInput | null>;

  putSession(hash: string, record: SessionRecord, ttlSeconds: number): Promise<void>;
  getSession(hash: string): Promise<SessionRecord | null>;
  /** Resets the expiry (sliding sessions). No-op for unknown keys. */
  touchSession(hash: string, ttlSeconds: number): Promise<void>;
  deleteSession(hash: string): Promise<void>;

  ping(): Promise<void>;
}

export interface SessionAuditEntry {
  sessionHash: string;
  userId: string;
  method: SessionRecord['method'];
  walletAddress: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/** Durable state (Postgres in production). */
export interface UserRepository {
  /** Finds the user owning this wallet or creates user + wallet; bumps wallet.last_seen. */
  upsertWalletUser(address: string, now: Date): Promise<{ userId: string; created: boolean }>;
  getMe(userId: string): Promise<Me | null>;
  recordSessionCreated(entry: SessionAuditEntry): Promise<void>;
  recordSessionRevoked(sessionHash: string, at: Date, reason: RevokeReason): Promise<void>;
  ping(): Promise<void>;
}
