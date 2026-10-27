import { type MediaReportRequest, MediaReportResponse, SetAvatarResponse } from '@windle/shared';
import { http } from '@/lib/api';

export const mediaApi = {
  setAvatar: (mediaId: string | null) => http.put('/v1/me/avatar', { mediaId }, SetAvatarResponse),
  report: (id: string, request: MediaReportRequest) =>
    http.post(`/v1/media/${id}/report`, request, MediaReportResponse),
};
