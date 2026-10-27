import type { Prefs } from './prefs';

type LoadableFont = Exclude<Prefs['font'], 'inter' | 'system' | 'mono'>;

const loaders: Record<LoadableFont, () => Promise<unknown>> = {
  atkinson: () => import('@fontsource-variable/atkinson-hyperlegible-next'),
};

const requested = new Set<LoadableFont>();

/** Fetches the stylesheet for a non-default font once; the default, the system stack and the mono face (always loaded for numbers) need nothing. */
export function loadFont(font: Prefs['font']): void {
  if (font === 'inter' || font === 'system' || font === 'mono' || requested.has(font)) return;
  requested.add(font);
  loaders[font]().catch(() => requested.delete(font));
}
