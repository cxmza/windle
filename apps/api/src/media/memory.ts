import type { MediaReportReason } from '@windle/shared';
import type { MediaRecord, MediaRemoval, MediaReportInput, MediaRepository, NewMedia, ReportedMedia } from './types.ts';

/** In-memory MediaRepository for tests and local dev, mirroring the Postgres keys (one report per user per image). */
export class MemoryMediaRepository implements MediaRepository {
  readonly rows = new Map<string, MediaRecord>();
  readonly uploads = new Set<string>();
  readonly avatars = new Map<string, string>();
  readonly reports = new Map<string, MediaReportInput>();
  private readonly addressOf: (userId: string) => string | null;

  constructor(opts: { addressOf?: (userId: string) => string | null } = {}) {
    this.addressOf = opts.addressOf ?? (() => null);
  }

  async get(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async insert(m: NewMedia) {
    this.uploads.add(`${m.id}:${m.ownerId}`);
    const existing = this.rows.get(m.id);
    if (existing) return { media: { ...existing }, created: false };
    const row: MediaRecord = { ...m, status: 'active', removedAt: null, removedBy: null };
    this.rows.set(m.id, row);
    return { media: { ...row }, created: true };
  }

  async isUploader(mediaId: string, userId: string) {
    return this.uploads.has(`${mediaId}:${userId}`);
  }

  async activeByIds(ids: readonly string[]) {
    const out = new Map<string, MediaRecord>();
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row?.status === 'active') out.set(id, { ...row });
    }
    return out;
  }

  async avatarsByUserIds(userIds: readonly string[]) {
    const out = new Map<string, MediaRecord>();
    for (const userId of userIds) {
      const id = this.avatars.get(userId);
      const row = id === undefined ? undefined : this.rows.get(id);
      if (row?.status === 'active') out.set(userId, { ...row });
    }
    return out;
  }

  async setAvatar(userId: string, mediaId: string | null) {
    if (mediaId === null) this.avatars.delete(userId);
    else this.avatars.set(userId, mediaId);
  }

  async totalActiveBytes() {
    let sum = 0;
    for (const row of this.rows.values()) if (row.status === 'active') sum += row.bytes;
    return sum;
  }

  async report(input: MediaReportInput) {
    const key = `${input.mediaId}:${input.reporterId}`;
    if (this.reports.has(key)) return false;
    this.reports.set(key, { ...input });
    return true;
  }

  async remove(id: string, by: string, at: Date): Promise<MediaRemoval | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const removed = row.status === 'active';
    if (removed) Object.assign(row, { status: 'removed', removedAt: at, removedBy: by });
    let detachedAvatars = 0;
    for (const [userId, mediaId] of this.avatars) {
      if (mediaId !== id) continue;
      this.avatars.delete(userId);
      detachedAvatars += 1;
    }
    return { media: { ...row }, removed, detachedAvatars };
  }

  async reported(limit: number): Promise<ReportedMedia[]> {
    const byMedia = new Map<string, { reports: number; reasons: Set<MediaReportReason>; last: Date }>();
    for (const r of this.reports.values()) {
      const entry = byMedia.get(r.mediaId) ?? { reports: 0, reasons: new Set<MediaReportReason>(), last: r.at };
      entry.reports += 1;
      entry.reasons.add(r.reason);
      if (r.at > entry.last) entry.last = r.at;
      byMedia.set(r.mediaId, entry);
    }
    const out: ReportedMedia[] = [];
    for (const [id, entry] of byMedia) {
      const row = this.rows.get(id);
      if (row?.status !== 'active') continue;
      out.push({
        media: { ...row },
        ownerAddress: this.addressOf(row.ownerId),
        reports: entry.reports,
        reasons: [...entry.reasons].sort(),
        lastReportedAt: entry.last,
      });
    }
    out.sort((a, b) => b.reports - a.reports || b.lastReportedAt.getTime() - a.lastReportedAt.getTime());
    return out.slice(0, limit);
  }
}
