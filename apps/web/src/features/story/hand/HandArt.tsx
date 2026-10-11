import { useId } from 'react';

/**
 * Engraved line-art hand holding a pencil (white ink + hatching, after the santioni etching). Hand-authored, static,
 * decorative. Ink is `currentColor`. The palm, cuff, thumb and pencil are veiled with a translucent page-background
 * fill (the hand reads as an object, text under it stays legible); the curled fingers are line + hatching only.
 * Geometry lives in a 200x200 viewBox; the pencil point is HAND_ART.nib (DrawingHand puts it on the stroke tip).
 */
export const HAND_ART = {
  viewBox: 200,
  /** Rendered size in px (the art is square). */
  size: 168,
  /** Graphite point in viewBox units. */
  nib: { x: 8, y: 192 },
} as const;

/**
 * Silhouette of the art (pencil + hand + cuff), viewBox units: a coarse convex outline, only used to keep the hand
 * clear of text it must not cover (hand-follow.ts).
 */
const HULL: readonly (readonly [number, number])[] = [
  [8, 192],
  [25, 166],
  [127, 64],
  [137, 60],
  [168, 80],
  [204, 72],
  [204, 170],
  [164, 182],
  [136, 184],
  [98, 178],
  [44, 160],
  [36, 146],
];

/** Convex hull (monotone chain), so the avoidance test can use the separating-axis theorem. */
function convex(points: readonly (readonly [number, number])[]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    ((a[0] ?? 0) - (o[0] ?? 0)) * ((b[1] ?? 0) - (o[1] ?? 0)) -
    ((a[1] ?? 0) - (o[1] ?? 0)) * ((b[0] ?? 0) - (o[0] ?? 0));
  const half = (list: readonly (readonly [number, number])[]) => {
    const out: [number, number][] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2] ?? p, out[out.length - 1] ?? p, p) <= 0) out.pop();
      out.push([p[0], p[1]]);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** The convex silhouette in rendered px around the pencil point. */
export const HAND_HULL_PX = convex(HULL).map(([x, y]) => ({
  x: ((x - HAND_ART.nib.x) * HAND_ART.size) / HAND_ART.viewBox,
  y: ((y - HAND_ART.nib.y) * HAND_ART.size) / HAND_ART.viewBox,
}));

/** Pencil point in rendered px, relative to the art's top-left. */
export const HAND_NIB_PX = {
  x: (HAND_ART.nib.x * HAND_ART.size) / HAND_ART.viewBox,
  y: (HAND_ART.nib.y * HAND_ART.size) / HAND_ART.viewBox,
} as const;

export function HandArt({ className }: { className?: string }) {
  const uid = useId().replace(/\W/g, '');
  const hatch = `${uid}-h`;
  const cross = `${uid}-x`;
  const solid = 'fill-background/55';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${HAND_ART.viewBox} ${HAND_ART.viewBox}`}
      width={HAND_ART.size}
      height={HAND_ART.size}
      overflow="visible"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <defs>
        <pattern id={hatch} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-60)">
          <path d="M0 0V3" strokeWidth="0.8" />
        </pattern>
        <pattern id={cross} width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V2.6" strokeWidth="0.7" />
        </pattern>
      </defs>
      {/* sleeve */}
      <path d="M168 86C184 100 192 130 182 158L204 170V72Z" className={solid} />
      <path d="M168 86C184 100 192 130 182 158L204 170V72Z" fill={`url(#${hatch})`} stroke="none" />
      <path d="M176 82C190 98 198 128 190 160" strokeWidth="1.2" />
      {/* curled middle, ring and little fingers */}
      <path d="M100 150C90 158 88 170 98 176C108 180 120 174 126 164ZM124 164C120 174 126 182 136 182C146 182 152 174 150 166ZM150 164C150 172 156 176 164 174C170 172 172 164 168 158Z" />
      <path
        d="M98 176C108 180 120 174 124 168L118 164C112 170 104 174 98 176ZM136 182C146 182 152 174 150 168L144 168C142 174 140 178 136 182Z"
        fill={`url(#${hatch})`}
        stroke="none"
      />
      {/* back of the hand */}
      <path
        d="M110 90C124 80 150 78 170 92C180 104 184 128 182 154C172 162 158 168 142 168C130 168 118 162 110 152C102 142 98 128 100 116C101 104 104 96 110 90Z"
        className={solid}
      />
      <path
        d="M182 120C182 136 182 146 180 154C170 162 156 166 142 167C152 158 166 146 174 128C176 122 178 118 182 120Z"
        fill={`url(#${hatch})`}
        stroke="none"
      />
      <path
        d="M160 100C146 110 132 124 122 142M172 114C158 126 146 142 138 160M150 92C138 98 126 106 116 116M118 158C122 154 128 154 132 158M136 164C140 160 146 160 150 163"
        strokeWidth="1"
      />
      {/* pencil */}
      <path d="M8 192L25 166.6L127.5 64.1L136 72.5L33.4 175Z" className={solid} />
      <path d="M33.4 175L136 72.5L131.7 68.3L29 170.8Z" fill={`url(#${cross})`} stroke="none" />
      <path d="M29 170.8L131.7 68.3" strokeWidth="0.9" />
      <path d="M8 192L14.5 182.3L17.7 185.5Z" fill="currentColor" strokeWidth="1" />
      <path d="M25 166.6C27 172 30 174 33.4 175M116 75.6L124.5 84M120 71.6L128.5 80" strokeWidth="1.3" />
      <path d="M127.5 64.1C131 57 141 63 136 72.5" className={solid} />
      {/* thumb */}
      <path d="M84 128C72 128 54 134 42 140C34 144 34 152 42 154C50 155 60 150 72 146Z" className={solid} />
      <path d="M42 154C50 155 60 150 72 146L70 150C60 154 50 157 42 154Z" fill={`url(#${hatch})`} stroke="none" />
      <path d="M39 144C42 141 46 141 48 144" strokeWidth="1" />
      {/* index finger, resting on the pencil */}
      <path
        d="M108 110C96 114 80 124 66 134C56 141 48 144 44 148C40 154 46 160 54 158C64 155 76 148 88 140C98 134 106 130 114 128C120 124 120 114 108 110Z"
        className={solid}
      />
      <path
        d="M54 158C64 155 76 148 88 140C98 134 106 130 114 128L112 134C102 138 92 142 82 150C72 156 62 160 54 158Z"
        fill={`url(#${hatch})`}
        stroke="none"
      />
      <path d="M47 149C49 146 53 145 56 147M76 132C80 134 81 138 79 142M92 122C96 124 97 128 95 132" strokeWidth="1" />
    </svg>
  );
}
