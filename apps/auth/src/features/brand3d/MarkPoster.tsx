import { MARK_PATH } from './mark-path';

const DEPTH_STEPS = 10;
/** Back-face shift per step in the 120-unit box: right and up, matching the rest pose of the 3D mark. */
const STEP = { x: 0.34, y: -0.13 } as const;

/**
 * Static stand-in for the 3D mark: same outline, same pose and lighting feel (graphite slab, blue flank, cyan blade),
 * built from stacked copies for the thickness. Shown until the WebGL chunk is ready, and when WebGL is unavailable.
 */
export function MarkPoster() {
  const layers = Array.from({ length: DEPTH_STEPS }, (_, i) => DEPTH_STEPS - i);
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="brand-poster" data-testid="mark-poster">
      <defs>
        <linearGradient id="poster-face" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" style={{ stopColor: 'oklch(0.3 0.03 262)' }} />
          <stop offset="0.45" style={{ stopColor: 'oklch(0.17 0.02 262)' }} />
          <stop offset="1" style={{ stopColor: 'oklch(0.11 0.015 262)' }} />
        </linearGradient>
        <linearGradient id="poster-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--blue-700)' }} />
          <stop offset="0.35" style={{ stopColor: 'var(--blue-500)' }} />
          <stop offset="0.7" style={{ stopColor: 'oklch(0.2 0.05 262)' }} />
          <stop offset="1" style={{ stopColor: 'var(--blue-800)' }} />
        </linearGradient>
        <linearGradient id="poster-blade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.82" style={{ stopColor: 'transparent' }} />
          <stop offset="1" style={{ stopColor: 'var(--blue-800)' }} />
        </linearGradient>
        <clipPath id="poster-clip">
          <path d={MARK_PATH} />
        </clipPath>
      </defs>
      <g transform="translate(60 60) scale(0.93 1) translate(-60 -60)">
        {layers.map((k) => (
          <path
            key={k}
            d={MARK_PATH}
            transform={`translate(${(STEP.x * k).toFixed(2)} ${(STEP.y * k).toFixed(2)})`}
            style={{ fill: `oklch(${(0.07 + (0.06 * (DEPTH_STEPS - k)) / DEPTH_STEPS).toFixed(3)} 0.02 262)` }}
          />
        ))}
        <path d={MARK_PATH} fill="url(#poster-face)" />
        <g clipPath="url(#poster-clip)">
          <rect x="14" y="14" width="92" height="92" fill="url(#poster-blade)" opacity="0.55" />
        </g>
        <path
          d={MARK_PATH}
          fill="none"
          stroke="url(#poster-edge)"
          strokeWidth="2.2"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: 2 }}
        />
      </g>
    </svg>
  );
}
