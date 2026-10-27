import { describe, expect, it } from 'vitest';
import { XMedia, XPost } from './x-feed.ts';

const VIDEO = 'https://video.twimg.com/amplify_video/1/vid/avc1/480x270/a.mp4?tag=16';
const POSTER = 'https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg';

const post = (media: unknown[]) => ({
  id: '2102711580479586741',
  kind: 'tweet',
  createdAt: '2026-09-23T10:48:01.935Z',
  receivedAt: '2026-09-23T10:48:02.000Z',
  url: 'https://x.com/a/status/2102711580479586741',
  author: { id: null, handle: 'a', name: 'a', avatarUrl: null, followers: null, tags: [] },
  text: 'x',
  media,
  quoted: null,
  inReplyTo: null,
  source: 'gmgn',
});

describe('XMedia.posterUrl', () => {
  it('keeps a video poster through parsing', () => {
    const parsed = XPost.parse(post([{ type: 'video', url: VIDEO, posterUrl: POSTER }]));
    expect(parsed.media[0]).toEqual({ type: 'video', url: VIDEO, posterUrl: POSTER });
  });

  it('accepts media without the field and with null, as older relays send it', () => {
    expect(XMedia.parse({ type: 'image', url: POSTER })).toEqual({ type: 'image', url: POSTER });
    expect(XMedia.parse({ type: 'gif', url: VIDEO, posterUrl: null }).posterUrl).toBeNull();
  });

  it('rejects a poster that is not a url', () => {
    expect(XMedia.safeParse({ type: 'video', url: VIDEO, posterUrl: 'thumb.jpg' }).success).toBe(false);
  });
});

describe('XPost.signals', () => {
  it('keeps signals and accepts posts without them', () => {
    expect(XPost.parse({ ...post([]), signals: ['cashtag', 'ca_sol'] }).signals).toEqual(['cashtag', 'ca_sol']);
    expect(XPost.parse(post([])).signals).toBeUndefined();
  });

  it('rejects null signals', () => {
    expect(XPost.safeParse({ ...post([]), signals: null }).success).toBe(false);
  });
});

describe('XQuoted rich fields', () => {
  const quoted = {
    id: '2109408642697199884',
    author: { handle: 'b', name: 'b', avatarUrl: null, verified: 'business' },
    text: 'original',
    media: [],
  };

  it('keeps the card, poll, article and urls of a quoted or reposted post', () => {
    const rich = {
      ...quoted,
      createdAt: '2026-10-11T22:19:45.993Z',
      urls: [{ url: 'https://t.co/a', expandedUrl: 'https://example.com/a', displayUrl: 'example.com/a' }],
      card: {
        kind: 'summary_large_image',
        url: 'https://example.com/a',
        domain: 'example.com',
        title: 'A',
        description: null,
        imageUrl: 'https://pbs.twimg.com/card_img/1/a',
      },
      poll: {
        options: [
          { label: 'yes', votes: 2 },
          { label: 'no', votes: 1 },
        ],
        totalVotes: 3,
        endsAt: null,
        closed: true,
      },
      article: { title: 'T', previewText: null, coverUrl: null, url: 'https://x.com/i/article/1' },
    };
    const parsed = XPost.parse({ ...post([]), kind: 'repost', text: '', quoted: rich, source: 'twitterapi' });
    expect(parsed.quoted).toEqual(rich);
  });

  it('accepts a quoted post without them, as the live feed sends it', () => {
    expect(XPost.parse({ ...post([]), kind: 'quote', quoted }).quoted).toEqual(quoted);
  });
});
