import { useSyncExternalStore } from 'react';

const REFRACT_MAP = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 56" preserveAspectRatio="none">
<defs>
<linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="#e08080"/><stop offset="1" stop-color="#808080"/></linearGradient>
<linearGradient id="r" x1="1" x2="0"><stop offset="0" stop-color="#208080"/><stop offset="1" stop-color="#808080"/></linearGradient>
<linearGradient id="t" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#80e080"/><stop offset="1" stop-color="#808080"/></linearGradient>
<linearGradient id="b" x1="0" x2="0" y1="1" y2="0"><stop offset="0" stop-color="#802080"/><stop offset="1" stop-color="#808080"/></linearGradient>
</defs>
<rect width="1100" height="56" fill="#808080"/>
<rect width="34" height="56" fill="url(#l)"/>
<rect x="1066" width="34" height="56" fill="url(#r)"/>
<rect width="1100" height="12" fill="url(#t)"/>
<rect y="44" width="1100" height="12" fill="url(#b)"/>
</svg>`,
);

const subscribe = () => () => {};

function supportsRefraction(): boolean {
  if (typeof navigator === 'undefined' || typeof CSS === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  const chromium = brands?.some((b) => b.brand === 'Chromium') ?? false;
  return chromium && CSS.supports('backdrop-filter', 'url(#x)');
}

/** Chromium only: backdrop-filter: url(#…) is ignored by Safari and Firefox, which keep the plain blur. */
export function LiquidGlassDefs() {
  const on = useSyncExternalStore(subscribe, supportsRefraction, () => false);
  if (!on) return null;
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute" data-dock-lens>
      <filter id="dock-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={`data:image/svg+xml,${REFRACT_MAP}`} preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="22" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
