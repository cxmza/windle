import type { XMedia, XPost } from '@windle/shared';

export const FIXTURE_NOW = Date.parse('2026-10-13T12:00:00.000Z');

const iso = (msAgo: number) => new Date(FIXTURE_NOW - msAgo).toISOString();

export const IMG = (n: number) => `https://pbs.twimg.com/media/fixture-${n}.jpg`;
export const AVATAR = 'https://pbs.twimg.com/profile_images/fixture/avatar.jpg';

export function xpost(overrides: Partial<XPost> = {}): XPost {
  return {
    id: '1846811200000000100',
    kind: 'tweet',
    createdAt: iso(90_000),
    receivedAt: iso(89_000),
    url: 'https://x.com/glowbyte_sol/status/1846811200000000100',
    author: {
      id: '42',
      handle: 'glowbyte_sol',
      name: 'Glowbyte',
      avatarUrl: AVATAR,
      followers: 12_345,
      tags: [],
    },
    text: 'Launchpad ships this week. $GLOW',
    media: [],
    quoted: null,
    inReplyTo: null,
    source: 'twitterapi',
    ...overrides,
  };
}

export const image = (n: number, extra: Partial<XMedia> = {}): XMedia => ({
  type: 'image',
  url: IMG(n),
  width: 1200,
  height: 675,
  ...extra,
});

export const richPost = (): XPost =>
  xpost({
    author: {
      id: '42',
      handle: 'glowbyte_sol',
      name: 'Glowbyte',
      avatarUrl: AVATAR,
      followers: 12_345,
      tags: ['founder'],
      verified: 'blue',
      affiliate: { name: 'Solana', handle: 'solana', badgeUrl: null },
    },
    text: 'Shipping the launchpad on Oct 20.\nDetails: https://t.co/abc123 cc @solana #builders $GLOW https://t.co/media1',
    urls: [
      {
        url: 'https://t.co/abc123',
        expandedUrl: 'https://glowbyte.xyz/launchpad',
        displayUrl: 'glowbyte.xyz/launchpad',
      },
    ],
    media: [image(1)],
    lang: 'en',
    edited: true,
    metrics: { replies: 1_234, reposts: 5_600, quotes: 12, likes: 34_567, bookmarks: 890, views: 3_400_000 },
    card: {
      kind: 'summary_large_image',
      url: 'https://glowbyte.xyz/launchpad',
      domain: 'glowbyte.xyz',
      title: 'Glowbyte Launchpad',
      description: 'Fair launches with a fixed deadline and public criteria.',
      imageUrl: IMG(9),
    },
    enrichedAt: iso(12_000),
  });

export const videoPost = (): XPost =>
  xpost({
    media: [
      {
        type: 'video',
        url: 'https://video.twimg.com/ext_tw_video/1/vid/1280x720/hi.mp4',
        posterUrl: IMG(2),
        width: 1280,
        height: 720,
        durationMs: 42_000,
        variants: [
          { url: 'https://video.twimg.com/low.mp4', contentType: 'video/mp4', bitrate: 256_000 },
          { url: 'https://video.twimg.com/mid.mp4', contentType: 'video/mp4', bitrate: 832_000 },
          { url: 'https://video.twimg.com/hi.mp4', contentType: 'video/mp4', bitrate: 2_176_000 },
          { url: 'https://video.twimg.com/pl.m3u8', contentType: 'application/x-mpegURL', bitrate: null },
        ],
      },
    ],
  });

export const pollPost = (closed: boolean): XPost =>
  xpost({
    text: 'Which chain next?',
    poll: {
      options: [
        { label: 'Solana', votes: 620 },
        { label: 'Base', votes: 280 },
        { label: 'Sui', votes: 100 },
      ],
      totalVotes: 1_000,
      endsAt: closed ? iso(3_600_000) : new Date(FIXTURE_NOW + 3 * 3_600_000).toISOString(),
      closed,
    },
  });

export const quotePost = (): XPost =>
  xpost({
    kind: 'quote',
    text: 'Agreed. This is the way.',
    quoted: {
      id: '1846811200000000200',
      author: { handle: 'fernwave_cto', name: 'Fernwave CTO', avatarUrl: AVATAR, verified: 'business' },
      text: 'Treasury vote opens Friday.',
      media: [image(4)],
      createdAt: iso(7_200_000),
    },
  });
