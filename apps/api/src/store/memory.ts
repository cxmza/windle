import type { Me, SiwsSignInInput } from '@windle/shared';
import { uuidv7 } from '../lib/crypto.ts';
import type { EphemeralStore, RevokeReason, SessionAuditEntry, SessionRecord, UserRepository } from './types.ts';

/** In-memory EphemeralStore with real TTL semantics against an injectable clock. Tests and local dev only. */
export class MemoryEphemeralStore implements EphemeralStore {
  private readonly nonces = new Map<string, { value: SiwsSignInInput; expiresAt: number }>();
  private readonly sessions = new Map<string, { value: SessionRecord; expiresAt: number }>();
  /** Set to make every call fail, to exercise dependency-down paths. */
  failing = false;

  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private async guard() {
    if (this.failing) throw new Error('memory store: simulated outage');
  }

  private live<T>(map: Map<string, { value: T; expiresAt: number }>, key: string) {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      map.delete(key);
      return undefined;
    }
    return entry;
  }

  async putNonce(nonce: string, input: SiwsSignInInput, ttlSeconds: number) {
    await this.guard();
    if (this.live(this.nonces, nonce)) return false;
    this.nonces.set(nonce, { value: structuredClone(input), expiresAt: this.now() + ttlSeconds * 1000 });
    return true;
  }

  async takeNonce(nonce: string) {
    await this.guard();
    const entry = this.live(this.nonces, nonce);
    this.nonces.delete(nonce);
    return entry ? entry.value : null;
  }

  async putSession(hash: string, record: SessionRecord, ttlSeconds: number) {
    await this.guard();
    this.sessions.set(hash, { value: { ...record }, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async getSession(hash: string) {
    await this.guard();
    const entry = this.live(this.sessions, hash);
    return entry ? { ...entry.value } : null;
  }

  async touchSession(hash: string, ttlSeconds: number) {
    await this.guard();
    const entry = this.live(this.sessions, hash);
    if (entry) entry.expiresAt = this.now() + ttlSeconds * 1000;
  }

  async deleteSession(hash: string) {
    await this.guard();
    this.sessions.delete(hash);
  }

  async ping() {
    await this.guard();
  }

  get sessionCount() {
    return this.sessions.size;
  }
}

interface MemoryAuditRow extends SessionAuditEntry {
  revokedAt: Date | null;
  revokeReason: string | null;
}

/** In-memory UserRepository mirroring the Postgres constraints that matter (one owner per wallet). */
export class MemoryUserRepository implements UserRepository {
  readonly users = new Map<string, { id: string; createdAt: Date }>();
  readonly wallets = new Map<string, { address: string; userId: string; firstSeen: Date; lastSeen: Date }>();
  readonly audit: MemoryAuditRow[] = [];
  failing = false;

  private async guard() {
    if (this.failing) throw new Error('memory repo: simulated outage');
  }

  async upsertWalletUser(address: string, now: Date) {
    await this.guard();
    const wallet = this.wallets.get(address);
    if (wallet) {
      wallet.lastSeen = now;
      return { userId: wallet.userId, created: false };
    }
    const id = uuidv7(now.getTime());
    this.users.set(id, { id, createdAt: now });
    this.wallets.set(address, { address, userId: id, firstSeen: now, lastSeen: now });
    return { userId: id, created: true };
  }

  async getMe(userId: string): Promise<Me | null> {
    await this.guard();
    const user = this.users.get(userId);
    if (!user) return null;
    const wallets = [...this.wallets.values()]
      .filter((w) => w.userId === userId)
      .sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime())
      .map((w) => ({ chain: 'solana' as const, address: w.address, linkedAt: w.firstSeen.toISOString() }));
    return { id: user.id, createdAt: user.createdAt.toISOString(), wallets };
  }

  async recordSessionCreated(entry: SessionAuditEntry) {
    await this.guard();
    this.audit.push({ ...entry, revokedAt: null, revokeReason: null });
  }

  async recordSessionRevoked(sessionHash: string, at: Date, reason: RevokeReason) {
    await this.guard();
    const row = this.audit.find((r) => r.sessionHash === sessionHash && r.revokedAt === null);
    if (row) {
      row.revokedAt = at;
      row.revokeReason = reason;
    }
  }

  async ping() {
    await this.guard();
  }
}
