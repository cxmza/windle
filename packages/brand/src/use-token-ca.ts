import { useState } from 'react';
import { isSolanaAddress, tokenCa } from './socials.ts';

/**
 * The CA to show: the configured one, else (dev builds only) a well-formed `?previewCa=<mint>` so the chip can be
 * reviewed before launch. With `devPreview` false the query is never read, so production ignores it.
 */
export function resolveCa(search: string, devPreview: boolean): string | null {
  const real = tokenCa();
  if (real !== null) return real;
  if (!devPreview) return null;
  const preview = new URLSearchParams(search).get('previewCa');
  return preview !== null && isSolanaAddress(preview) ? preview : null;
}

/** Pass `import.meta.env.DEV` as `devPreview`. Read once on mount: the preview is a review aid, not state. */
export function useTokenCa(devPreview: boolean): string | null {
  const [ca] = useState(() => resolveCa(typeof window === 'undefined' ? '' : window.location.search, devPreview));
  return ca;
}
