import type { XMediaVariant } from '@windle/shared';

const SMALL_SCREEN_MAX_BITRATE = 1_000_000;
const MP4 = /\.mp4(\?|#|$)/i;

/**
 * Every file worth trying, in order: mp4 only, the best bitrate on a normal screen and the best one that is still light
 * on a small screen first, then the rest from heaviest to lightest, so a player whose first file fails has somewhere
 * to go. Without variants the media url itself is used when it is an mp4. Empty means nothing here can play inline.
 */
export function pickVariants(
  media: { url: string; variants?: readonly XMediaVariant[] | undefined },
  smallScreen: boolean,
): string[] {
  const mp4 = (media.variants ?? [])
    .filter((v) => v.contentType.toLowerCase().includes('mp4'))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const best = mp4[0];
  if (!best) return MP4.test(media.url) ? [media.url] : [];
  const first = smallScreen
    ? (mp4.find((v) => (v.bitrate ?? 0) <= SMALL_SCREEN_MAX_BITRATE) ?? mp4[mp4.length - 1] ?? best)
    : best;
  return [first.url, ...mp4.filter((v) => v !== first).map((v) => v.url)];
}

/** The file to play first; null means nothing here can play inline. */
export const pickVariant = (
  media: { url: string; variants?: readonly XMediaVariant[] | undefined },
  smallScreen: boolean,
): string | null => pickVariants(media, smallScreen)[0] ?? null;
