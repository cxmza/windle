import { describe, expect, it } from 'vitest';
import { Me } from './auth.ts';
import { ApiImage, MediaId, MediaUploadQuery, SetAvatarRequest } from './media.ts';

const ID = 'a'.repeat(64);
const url = (p: string) => `https://cdn.windle.fun/img/sig/${p}/plain/media/aa/${ID}.webp@webp`;
const image = {
  id: ID,
  width: 640,
  height: 480,
  thumbhash: 'MQiCBQAMaEN/eIU4SAAAAAAASBCJiIQIFQ==',
  urls: {
    avatar64: url('rs:fill:64:64'),
    avatar128: url('rs:fill:128:128'),
    thumb: url('rs:fill:160:160'),
    card: url('rs:fit:480:480'),
    cover: url('rs:fit:1200:1200'),
    og: url('rs:fill:1200:630'),
  },
};

describe('media contracts', () => {
  it('accepts a full ApiImage and rejects a bad id', () => {
    expect(ApiImage.parse(image)).toEqual(image);
    expect(ApiImage.safeParse({ ...image, id: 'A'.repeat(64) }).success).toBe(false);
    expect(MediaId.safeParse(ID.slice(1)).success).toBe(false);
  });

  it('defaults the upload kind and allows clearing the avatar', () => {
    expect(MediaUploadQuery.parse({})).toEqual({ kind: 'market' });
    expect(SetAvatarRequest.parse({ mediaId: null })).toEqual({ mediaId: null });
    expect(SetAvatarRequest.safeParse({}).success).toBe(false);
  });

  it('keeps Me valid with and without an avatar', () => {
    const me = { id: '0b8f3c0e-6a51-4d47-9a8e-2f4c1d7b9e10', createdAt: '2026-10-11T12:00:00.000Z', wallets: [] };
    expect(Me.parse(me)).toEqual(me);
    expect(Me.parse({ ...me, avatar: null }).avatar).toBeNull();
    expect(Me.parse({ ...me, avatar: image }).avatar?.id).toBe(ID);
  });
});
