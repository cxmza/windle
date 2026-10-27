import { loadFont } from './fonts';
import type { Prefs } from './prefs';

export type ResolvedTheme = 'light' | 'dark';

const SYSTEM_QUERIES = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'] as const;

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function resolveTheme(theme: Prefs['theme'], systemDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

/** What lands on <html>: null means the attribute is absent. */
export function appearanceAttributes(
  prefs: Pick<Prefs, 'theme' | 'font' | 'textSize' | 'contrast'>,
): Record<string, string | null> {
  return {
    'data-theme': resolveTheme(prefs.theme, matches(SYSTEM_QUERIES[0])),
    'data-contrast': prefs.contrast === 'on' || matches(SYSTEM_QUERIES[1]) ? 'more' : null,
    'data-text-size': prefs.textSize === 'medium' ? null : prefs.textSize,
    'data-font': prefs.font === 'inter' ? null : prefs.font,
  };
}

const CHROME_COLOR: Record<ResolvedTheme, string> = { light: '#f4f4f4', dark: '#000000' };

let thawFrame = 0;

/** Holds every CSS transition off for two frames so a theme switch lands in one paint instead of cross-fading. */
function freezeTransitions(root: HTMLElement): void {
  root.setAttribute('data-no-transition', '');
  const release = () => root.removeAttribute('data-no-transition');
  if (typeof window.requestAnimationFrame !== 'function') {
    window.setTimeout(release, 50);
    return;
  }
  window.cancelAnimationFrame(thawFrame);
  thawFrame = window.requestAnimationFrame(() => {
    thawFrame = window.requestAnimationFrame(release);
  });
}

export function applyAppearance(prefs: Prefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const next = appearanceAttributes(prefs);
  const changed = Object.entries(next).filter(([name, value]) => root.getAttribute(name) !== value);
  if (changed.length > 0) {
    freezeTransitions(root);
    for (const [name, value] of changed) {
      if (value === null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
  }
  const theme: ResolvedTheme = next['data-theme'] === 'light' ? 'light' : 'dark';
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME_COLOR[theme]);
  loadFont(prefs.font);
}

/** Calls back when the OS changes colour scheme or contrast, so "System" and the automatic fallbacks stay live. */
export function watchSystemAppearance(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const lists = SYSTEM_QUERIES.map((q) => window.matchMedia(q));
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}
