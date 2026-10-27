import type { MediaKind, MediaReportReason } from '@windle/shared';

export type MediaStatus = 'active' | 'removed';

export interface MediaRecord {
  id: string;
  ownerId: string;
  kind: MediaKind;
  width: number;
  height: number;
  bytes: number;
  thumbhash: string;
  status: MediaStatus;
  createdAt: Date;
  removedAt: Date | null;
  removedBy: string | null;
}

export interface NewMedia {
  id: string;
  ownerId: string;
  kind: MediaKind;
  width: number;
  height: number;
  bytes: number;
  thumbhash: string;
  createdAt: Date;
}

export interface MediaReportInput {
  mediaId: string;
  reporterId: string;
  reason: MediaReportReason;
  note: string | null;
  at: Date;
}

export interface MediaRemoval {
  media: MediaRecord;
  /** False when it was already removed. */
  removed: boolean;
  detachedAvatars: number;
}

export interface ReportedMedia {
  media: MediaRecord;
  ownerAddress: string | null;
  reports: number;
  reasons: MediaReportReason[];
  lastReportedAt: Date;
}

/** Durable image metadata (Postgres in production, memory in tests). The bytes live on disk (MediaStorage). */
export interface MediaRepository {
  get(id: string): Promise<MediaRecord | null>;
  /** Inserts the row or keeps an existing one (the first uploader stays owner); `ownerId` is recorded as an uploader. */
  insert(media: NewMedia): Promise<{ media: MediaRecord; created: boolean }>;
  isUploader(mediaId: string, userId: string): Promise<boolean>;
  /** Active rows only. */
  activeByIds(ids: readonly string[]): Promise<Map<string, MediaRecord>>;
  /** Per user id, the active avatar; users without one are left out. */
  avatarsByUserIds(userIds: readonly string[]): Promise<Map<string, MediaRecord>>;
  setAvatar(userId: string, mediaId: string | null): Promise<void>;
  totalActiveBytes(): Promise<number>;
  /** False when this user already reported this image. */
  report(input: MediaReportInput): Promise<boolean>;
  /** Marks the image removed and clears it from every avatar, in one transaction. Null when unknown. */
  remove(id: string, by: string, at: Date): Promise<MediaRemoval | null>;
  reported(limit: number): Promise<ReportedMedia[]>;
}
