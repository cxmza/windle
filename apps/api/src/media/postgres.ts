import type { MediaKind, MediaReportReason } from '@windle/shared';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import type { Db } from '../store/postgres.ts';
import type {
  MediaRecord,
  MediaRemoval,
  MediaReportInput,
  MediaRepository,
  MediaStatus,
  NewMedia,
  ReportedMedia,
} from './types.ts';

type MediaRow = typeof schema.media.$inferSelect;

const md = schema.media;
const u = schema.users;

const toMedia = (r: MediaRow): MediaRecord => ({
  id: r.id,
  ownerId: r.ownerId,
  kind: r.kind as MediaKind,
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  thumbhash: r.thumbhash,
  status: r.status as MediaStatus,
  createdAt: r.createdAt,
  removedAt: r.removedAt,
  removedBy: r.removedBy,
});

interface ReportedSqlRow extends Record<string, unknown> {
  media_id: string;
  reports: number;
  reasons: string[];
  last_at: Date | string;
  owner_address: string | null;
}

export class PostgresMediaRepository implements MediaRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async get(id: string) {
    const [row] = await this.db.select().from(md).where(eq(md.id, id));
    return row ? toMedia(row) : null;
  }

  async insert(m: NewMedia) {
    return this.db.transaction(async (tx) => {
      const inserted = await tx.insert(md).values(m).onConflictDoNothing().returning();
      await tx
        .insert(schema.mediaUploads)
        .values({ mediaId: m.id, userId: m.ownerId, createdAt: m.createdAt })
        .onConflictDoNothing();
      const created = inserted[0];
      if (created) return { media: toMedia(created), created: true };
      const [existing] = await tx.select().from(md).where(eq(md.id, m.id));
      if (!existing) throw new Error(`media ${m.id} vanished inside its transaction`);
      return { media: toMedia(existing), created: false };
    });
  }

  async isUploader(mediaId: string, userId: string) {
    const rows = await this.db
      .select({ one: sql<number>`1` })
      .from(schema.mediaUploads)
      .where(and(eq(schema.mediaUploads.mediaId, mediaId), eq(schema.mediaUploads.userId, userId)));
    return rows.length > 0;
  }

  async activeByIds(ids: readonly string[]) {
    const out = new Map<string, MediaRecord>();
    const unique = [...new Set(ids)];
    if (unique.length === 0) return out;
    const rows = await this.db
      .select()
      .from(md)
      .where(and(inArray(md.id, unique), eq(md.status, 'active')));
    for (const row of rows) out.set(row.id, toMedia(row));
    return out;
  }

  async avatarsByUserIds(userIds: readonly string[]) {
    const out = new Map<string, MediaRecord>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return out;
    const rows = await this.db
      .select({ userId: u.id, media: md })
      .from(u)
      .innerJoin(md, eq(md.id, u.avatarMediaId))
      .where(and(inArray(u.id, unique), eq(md.status, 'active')));
    for (const row of rows) out.set(row.userId, toMedia(row.media));
    return out;
  }

  async setAvatar(userId: string, mediaId: string | null) {
    await this.db.update(u).set({ avatarMediaId: mediaId }).where(eq(u.id, userId));
  }

  async totalActiveBytes() {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${md.bytes}), 0)::bigint` })
      .from(md)
      .where(eq(md.status, 'active'));
    return Number(row?.total ?? 0);
  }

  async report(input: MediaReportInput) {
    const rows = await this.db
      .insert(schema.mediaReports)
      .values({
        mediaId: input.mediaId,
        reporterId: input.reporterId,
        reason: input.reason,
        note: input.note,
        createdAt: input.at,
      })
      .onConflictDoNothing()
      .returning({ mediaId: schema.mediaReports.mediaId });
    return rows.length > 0;
  }

  async remove(id: string, by: string, at: Date): Promise<MediaRemoval | null> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(md).where(eq(md.id, id)).for('update');
      if (!current) return null;
      const removed = current.status === 'active';
      let row = current;
      if (removed) {
        const [updated] = await tx
          .update(md)
          .set({ status: 'removed', removedAt: at, removedBy: by })
          .where(eq(md.id, id))
          .returning();
        if (updated) row = updated;
      }
      const avatars = await tx
        .update(u)
        .set({ avatarMediaId: null })
        .where(and(isNotNull(u.avatarMediaId), eq(u.avatarMediaId, id)))
        .returning({ id: u.id });
      return { media: toMedia(row), removed, detachedAvatars: avatars.length };
    });
  }

  async reported(limit: number): Promise<ReportedMedia[]> {
    const rows = await this.db.execute<ReportedSqlRow>(sql`
      select r.media_id, count(*)::int as reports, array_agg(distinct r.reason order by r.reason) as reasons,
        max(r.created_at) as last_at,
        (select w.address from wallets w where w.user_id = m.owner_id order by w.first_seen limit 1) as owner_address
      from media_reports r
      join media m on m.id = r.media_id and m.status = 'active'
      group by r.media_id, m.owner_id
      order by reports desc, last_at desc
      limit ${limit}`);
    const list = [...rows];
    const media = await this.activeByIds(list.map((r) => r.media_id));
    return list.flatMap((r) => {
      const m = media.get(r.media_id);
      if (!m) return [];
      return [
        {
          media: m,
          ownerAddress: r.owner_address,
          reports: Number(r.reports),
          reasons: r.reasons as MediaReportReason[],
          lastReportedAt: new Date(r.last_at),
        },
      ];
    });
  }
}
