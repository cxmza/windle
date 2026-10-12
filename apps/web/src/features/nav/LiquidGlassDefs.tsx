import { useEffect, useState, useSyncExternalStore } from 'react';

/** Rim width (px) over which the lens bends the backdrop; the centre of the island stays flat. */
export const LENS_BEZEL = 15;
/** feDisplacementMap scale (px): the rim samples up to half of this far from its own position. */
export const LENS_SCALE = 18;
/** Share of the green and blue displacement relative to red: a thin chromatic split on the rim. */
export const LENS_CHROMA = [1, 0.98, 0.96] as const;
const LENS_MAGNIFY = 0.05;

interface LensMapOptions {
  width: number;
  height: number;
  bezel?: number;
  magnify?: number;
}

/**
 * Pure: RGBA bytes of a displacement map for a pill-shaped convex lens. R and G carry the sampling offset (128 = none).
 * Inside the rim the offset points toward the centre and eases out as `((1 + cos(πt)) / 2)^1.5`, t = depth / bezel, so
 * the bend is strongest at the edge and zero in the flat middle; a faint linear term adds the magnification.
 */
export function buildLensMap({ width, height, bezel = LENS_BEZEL, magnify = LENS_MAGNIFY }: LensMapOptions) {
  const data = new Uint8ClampedArray(width * height * 4);
  const radius = Math.min(width, height) / 2;
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - width / 2;
      const py = y + 0.5 - height / 2;
      const qx = Math.abs(px) - hx;
      const qy = Math.abs(py) - hy;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outer = Math.hypot(ox, oy);
      const depth = radius - (outer + Math.min(Math.max(qx, qy), 0));
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        nx = (Math.sign(px) * ox) / outer;
        ny = (Math.sign(py) * oy) / outer;
      } else if (qx > qy) {
        nx = Math.sign(px);
      } else {
        ny = Math.sign(py);
      }
      const t = Math.min(1, Math.max(0, depth / bezel));
      const bend = ((1 + Math.cos(Math.PI * t)) / 2) ** 1.5;
      const vx = Math.max(-1, Math.min(1, -nx * bend - (px / (width / 2)) * magnify));
      const vy = Math.max(-1, Math.min(1, -ny * bend - (py / (height / 2)) * magnify));
      const i = (y * width + x) * 4;
      data[i] = 128 + vx * 127;
      data[i + 1] = 128 + vy * 127;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}

const subscribe = () => () => {};

function supportsRefraction(): boolean {
  if (typeof navigator === 'undefined' || typeof CSS === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  const chromium = brands?.some((b) => b.brand === 'Chromium') ?? false;
  return chromium && CSS.supports('backdrop-filter', 'url(#x)');
}

/**
 * Chromium only (backdrop-filter: url(#…) is ignored by Safari and Firefox, which keep the blur glass): a PNG data URL of
 * the lens map for an island of this exact size, or null. Rebuilt only when the size changes.
 */
export function useLensMap(width: number, height: number, enabled: boolean): string | null {
  const supported = useSyncExternalStore(subscribe, supportsRefraction, () => false);
  const [href, setHref] = useState<string | null>(null);
  const active = enabled && supported && width > 0 && height > 0;
  useEffect(() => {
    if (!active) {
      setHref(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(buildLensMap({ width, height }), width, height), 0, 0);
    setHref(canvas.toDataURL('image/png'));
  }, [active, width, height]);
  return active ? href : null;
}

interface LiquidGlassDefsProps {
  id: string;
  href: string;
  width: number;
  height: number;
}

/** The island's SVG filter: the map displaces the backdrop once per colour channel, the channels are screened back together. */
export function LiquidGlassDefs({ id, href, width, height }: LiquidGlassDefsProps) {
  const channels = [
    { key: 'r', scale: LENS_SCALE * LENS_CHROMA[0], matrix: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0' },
    { key: 'g', scale: LENS_SCALE * LENS_CHROMA[1], matrix: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0' },
    { key: 'b', scale: LENS_SCALE * LENS_CHROMA[2], matrix: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0' },
  ] as const;
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute" data-dock-lens>
      <filter
        id={id}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={width}
        height={height}
        colorInterpolationFilters="sRGB"
      >
        <feImage href={href} x="0" y="0" width={width} height={height} preserveAspectRatio="none" result="map" />
        {channels.map((c) => (
          <feDisplacementMap
            key={c.key}
            in="SourceGraphic"
            in2="map"
            scale={c.scale}
            xChannelSelector="R"
            yChannelSelector="G"
            result={`d${c.key}`}
          />
        ))}
        {channels.map((c) => (
          <feColorMatrix key={c.key} in={`d${c.key}`} type="matrix" values={c.matrix} result={`c${c.key}`} />
        ))}
        <feBlend in="cr" in2="cg" mode="screen" result="rg" />
        <feBlend in="rg" in2="cb" mode="screen" />
      </filter>
    </svg>
  );
}
