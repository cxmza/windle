/**
 * Skip link, first in the tab order. A button (not an anchor): it focuses <main> without touching the URL.
 * The brand lockup and all navigation live in the top bar (Dock.tsx).
 */
export function Header() {
  return (
    <button
      type="button"
      data-skip-link
      onClick={() => document.getElementById('main')?.focus()}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-(--gutter) focus-visible:top-2 focus-visible:z-(--z-sheet) focus-visible:rounded-pill focus-visible:bg-emphasis focus-visible:px-4 focus-visible:py-2 focus-visible:text-kicker focus-visible:font-semibold focus-visible:uppercase focus-visible:text-emphasis-foreground"
    >
      Skip to content
    </button>
  );
}
