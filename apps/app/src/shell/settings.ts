import { useLocation } from 'react-router';

export const SETTINGS_PARAM = 'settings';

export const SETTINGS_SECTIONS = ['general', 'display', 'account', 'developers'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The section named by `?settings=`; anything unknown opens General. */
export function parseSettingsSection(value: string | null): SettingsSection {
  return SETTINGS_SECTIONS.find((s) => s === value) ?? 'general';
}

type LocationLike = { pathname: string; search: string; hash: string };

/** The current location with `?settings=<section>` added; every other search param and the hash are kept. */
export function settingsHref(location: LocationLike, section: SettingsSection = 'general'): string {
  const params = new URLSearchParams(location.search);
  params.set(SETTINGS_PARAM, section);
  return `${location.pathname}?${params}${location.hash}`;
}

export function useSettingsHref(section: SettingsSection = 'general'): string {
  return settingsHref(useLocation(), section);
}
