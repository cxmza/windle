import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiImage, LeaderboardResponse, MarketDetailResponse, Me, MediaReportRequest } from '@windle/shared';
import { useMyAddress } from '@/features/predict/hooks';
import { predictKeys } from '@/features/predict/queries';
import { meQuery } from '@/features/session/queries';
import { ApiRequestError } from '@/lib/api';
import { mediaApi } from './api';
import { markReported } from './reported';

/** The signed-in person's avatar from `GET /v1/me`; null when none or while it loads. */
export function useMyAvatar(): ApiImage | null {
  return useQuery({ ...meQuery(), select: (me) => me.avatar ?? null }).data ?? null;
}

/**
 * PUT /v1/me/avatar. The answer goes straight into the caches that show the avatar (me, the leaderboard, trade rows
 * on open market pages) so every screen updates before any refetch.
 */
export function useSetAvatar() {
  const client = useQueryClient();
  const address = useMyAddress();
  return useMutation({
    mutationFn: async (mediaId: string | null) => (await mediaApi.setAvatar(mediaId)).avatar,
    onSuccess: (avatar) => {
      client.setQueryData(meQuery().queryKey, (old: Me | undefined) => (old ? { ...old, avatar } : old));
      if (!address) return;
      client.setQueryData(predictKeys.leaderboard, (old: LeaderboardResponse | undefined) =>
        old
          ? {
              ...old,
              entries: old.entries.map((e) => (e.address === address ? { ...e, avatar } : e)),
              me: old.me && old.me.address === address ? { ...old.me, avatar } : old.me,
            }
          : old,
      );
      client.setQueriesData({ queryKey: ['predict', 'market'] }, (old: MarketDetailResponse | undefined) =>
        old && Array.isArray(old.trades)
          ? { ...old, trades: old.trades.map((t) => (t.by === address ? { ...t, avatar } : t)) }
          : old,
      );
    },
  });
}

export function useReportImage(imageId: string) {
  return useMutation({
    mutationFn: (request: MediaReportRequest) => mediaApi.report(imageId, request),
    onSuccess: () => markReported(imageId),
    onError: (error) => {
      // Already reported by this person: the end state is the same one the button shows.
      if (error instanceof ApiRequestError && error.code === 'media_already_reported') markReported(imageId);
    },
  });
}
