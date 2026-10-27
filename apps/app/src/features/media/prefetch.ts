import { useQueryClient } from '@tanstack/react-query';
import type { ApiMarket } from '@windle/shared';
import { marketQuery } from '@/features/predict/queries';
import { prefetchImage } from './placeholder';

/**
 * Warm what the market page will ask for first: the detail request and the header picture in the rendition this
 * screen's pixel density will pick. The page header shows the picture at most 56 px wide, so `cover` is never needed.
 */
export function usePrefetchMarket(): (market: ApiMarket) => void {
  const client = useQueryClient();
  return (market) => {
    void client.prefetchQuery(marketQuery(market.slug));
    if (market.image) {
      const dense = typeof window !== 'undefined' && window.devicePixelRatio > 1;
      prefetchImage(dense ? market.image.urls.avatar128 : market.image.urls.avatar64);
    }
  };
}
