/**
 * The windle "notch" mark, approved outline (120 x 120 box, y down). Kept free of `three` imports so the
 * eager SVG poster can use it without pulling the 3D library into the initial bundle.
 */
export const MARK_PATH =
  'M30 14H32.5L44 58L55.5 14H64.5L76 58L87.5 14H90A16 16 0 0 1 106 30V90A16 16 0 0 1 90 106H73.3L60 70L46.7 106H30A16 16 0 0 1 14 90V30A16 16 0 0 1 30 14Z';
