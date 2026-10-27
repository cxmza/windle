import type { ReactNode } from 'react';
import { ChevronUpDownIcon } from '@/shell/icons';
import type { SettingsSection } from '@/shell/settings';
import { MemberSince, SessionExpires, SignedInAs, SignOutControl, WalletsList } from './AccountRows';
import { ApiBaseUrl, ApiKeys, DocsLink } from './DeveloperRows';
import { type PrefKey, type Prefs, setPref, usePref } from './prefs';
import { SegmentedControl } from './SegmentedControl';
import { SelectControl } from './SelectControl';
import { MonitorIcon, MoonIcon, SunIcon } from './theme-icons';

type Choice<K extends PrefKey> = { value: Prefs[K]; label: string; icon?: ReactNode };

type PrefControlProps<K extends PrefKey> = { prefKey: K; label: string; options: readonly Choice<K>[] };

function PrefSegmented<K extends PrefKey>({ prefKey, label, options }: PrefControlProps<K>) {
  return (
    <SegmentedControl
      label={label}
      value={usePref(prefKey)}
      onValueChange={(v) => setPref(prefKey, v)}
      options={options}
    />
  );
}

function PrefSelect<K extends PrefKey>({ prefKey, label, options }: PrefControlProps<K>) {
  return (
    <SelectControl
      label={label}
      value={usePref(prefKey)}
      onValueChange={(v) => setPref(prefKey, v)}
      options={options}
    />
  );
}

function StaticValue({ children }: { children: ReactNode }) {
  return <span className="text-sm text-foreground">{children}</span>;
}

function DisabledUsd() {
  return (
    <span
      aria-disabled="true"
      className="inline-flex h-8 min-w-44 cursor-not-allowed items-center justify-between gap-3 rounded-lg border border-(--hairline) px-3 text-sm text-muted-foreground opacity-60 max-md:h-11"
    >
      <span>Unavailable</span>
      <ChevronUpDownIcon />
    </span>
  );
}

export type SettingDef = {
  id: string;
  section: SettingsSection;
  group: string;
  label: string;
  description?: string;
  keywords: readonly string[];
  stacked?: boolean;
  control: ReactNode;
};

export const SECTION_TITLES: Record<SettingsSection, string> = {
  general: 'General',
  display: 'Display',
  account: 'Account',
  developers: 'Developers',
};

export const NAV_GROUPS: readonly { label: string; sections: readonly SettingsSection[] }[] = [
  { label: 'Settings', sections: ['general', 'display', 'account'] },
  { label: 'Platform', sections: ['developers'] },
];

export const SETTINGS: readonly SettingDef[] = [
  {
    id: 'theme',
    section: 'general',
    group: 'Appearance',
    label: 'Theme',
    keywords: ['dark', 'light', 'system', 'color', 'colour', 'mode', 'night', 'day', 'appearance'],
    control: (
      <PrefSegmented
        prefKey="theme"
        label="Theme"
        options={[
          { value: 'system', label: 'System', icon: <MonitorIcon /> },
          { value: 'light', label: 'Light', icon: <SunIcon /> },
          { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
        ]}
      />
    ),
  },
  {
    id: 'font',
    section: 'general',
    group: 'Appearance',
    label: 'Font',
    description: 'The typeface for text across the app.',
    keywords: ['typeface', 'inter', 'atkinson', 'hyperlegible', 'dyslexia', 'jetbrains', 'monospace', 'system'],
    control: (
      <PrefSelect
        prefKey="font"
        label="Font"
        options={[
          { value: 'inter', label: 'Inter Tight (default)' },
          { value: 'system', label: 'System' },
          { value: 'atkinson', label: 'Atkinson Hyperlegible' },
          { value: 'mono', label: 'JetBrains Mono' },
        ]}
      />
    ),
  },
  {
    id: 'text-size',
    section: 'general',
    group: 'Appearance',
    label: 'Text size',
    description: 'Scales the text and everything sized with it.',
    keywords: ['font size', 'zoom', 'larger', 'smaller', 'bigger', 'scale', 'accessibility'],
    control: (
      <PrefSegmented
        prefKey="textSize"
        label="Text size"
        options={[
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ]}
      />
    ),
  },
  {
    id: 'contrast',
    section: 'general',
    group: 'Appearance',
    label: 'High contrast',
    description: 'Stronger text, borders and focus outlines. Also on when your system asks for more contrast.',
    keywords: ['contrast', 'accessibility', 'vision', 'borders', 'focus', 'legibility'],
    control: (
      <PrefSegmented
        prefKey="contrast"
        label="High contrast"
        options={[
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' },
        ]}
      />
    ),
  },
  {
    id: 'motion',
    section: 'general',
    group: 'Interface',
    label: 'Motion',
    description: 'Reduce animation across the app. Match system follows your operating system setting.',
    keywords: ['animation', 'reduced motion', 'accessibility', 'transitions'],
    control: (
      <PrefSegmented
        prefKey="motion"
        label="Motion"
        options={[
          { value: 'system', label: 'Match system' },
          { value: 'reduced', label: 'Reduced' },
        ]}
      />
    ),
  },
  {
    id: 'live',
    section: 'general',
    group: 'Interface',
    label: 'Live feed',
    description: 'New posts stream into the X feed as they arrive. Off keeps the feed still.',
    keywords: ['feed', 'posts', 'updates', 'stream', 'realtime'],
    control: (
      <PrefSegmented
        prefKey="live"
        label="Live feed"
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
      />
    ),
  },
  {
    id: 'feed-motion',
    section: 'general',
    group: 'Interface',
    label: 'Feed motion',
    description:
      'How new posts arrive in the X feed. Calm fades them in without growing the list. Reduced motion always uses Calm.',
    keywords: ['x feed', 'posts', 'animation', 'calm', 'smooth', 'tweets', 'growth'],
    control: (
      <PrefSegmented
        prefKey="feedMotion"
        label="Feed motion"
        options={[
          { value: 'smooth', label: 'Smooth' },
          { value: 'calm', label: 'Calm' },
        ]}
      />
    ),
  },
  {
    id: 'density',
    section: 'general',
    group: 'Markets',
    label: 'Table density',
    description: 'Row height in the markets list and the projects catalog.',
    keywords: ['compact', 'comfortable', 'rows', 'spacing', 'list', 'catalog'],
    control: (
      <PrefSegmented
        prefKey="density"
        label="Table density"
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
      />
    ),
  },

  {
    id: 'odds',
    section: 'display',
    group: 'Numbers and time',
    label: 'Odds format',
    description: 'How the chance that a promise ships is written everywhere in the app.',
    keywords: ['percent', 'decimal', 'probability', 'ship odds', 'price'],
    control: (
      <PrefSelect
        prefKey="odds"
        label="Odds format"
        options={[
          { value: 'percent', label: 'Percent (62%)' },
          { value: 'decimal', label: 'Decimal odds (1.61)' },
        ]}
      />
    ),
  },
  {
    id: 'deadlines',
    section: 'display',
    group: 'Numbers and time',
    label: 'Deadlines',
    description: 'Show the time left, or the local date and time a promise is checked.',
    keywords: ['countdown', 'date', 'time left', 'timer', 'local time'],
    control: (
      <PrefSegmented
        prefKey="deadlines"
        label="Deadlines"
        options={[
          { value: 'countdown', label: 'Countdown' },
          { value: 'date', label: 'Date & time' },
        ]}
      />
    ),
  },
  {
    id: 'clock',
    section: 'display',
    group: 'Numbers and time',
    label: 'Clock',
    description: 'Hour format in dates and times.',
    keywords: ['24-hour', '12-hour', 'am', 'pm', 'time format'],
    control: (
      <PrefSegmented
        prefKey="clock"
        label="Clock"
        options={[
          { value: '24h', label: '24-hour' },
          { value: '12h', label: '12-hour' },
        ]}
      />
    ),
  },
  {
    id: 'currency',
    section: 'display',
    group: 'Currency',
    label: 'Currency',
    description: 'Amounts are in SOL, the unit collateral is locked in.',
    keywords: ['sol', 'solana', 'amount', 'collateral'],
    control: <StaticValue>SOL</StaticValue>,
  },
  {
    id: 'usd',
    section: 'display',
    group: 'Currency',
    label: '≈ USD',
    description: 'Needs a price feed — not available yet',
    keywords: ['dollar', 'fiat', 'price', 'usd'],
    control: <DisabledUsd />,
  },

  {
    id: 'wallets',
    section: 'account',
    group: 'Wallets',
    label: 'Wallets',
    description: 'Addresses linked to this account.',
    keywords: ['address', 'solana', 'linked', 'copy'],
    stacked: true,
    control: <WalletsList />,
  },
  {
    id: 'signed-in-as',
    section: 'account',
    group: 'This session',
    label: 'Signed in as',
    keywords: ['address', 'wallet', 'identity'],
    control: <SignedInAs />,
  },
  {
    id: 'expires',
    section: 'account',
    group: 'This session',
    label: 'Session expires',
    keywords: ['expiry', 'sign in', 'session'],
    control: <SessionExpires />,
  },
  {
    id: 'member-since',
    section: 'account',
    group: 'This session',
    label: 'Member since',
    keywords: ['created', 'joined', 'registered'],
    control: <MemberSince />,
  },
  {
    id: 'sign-out',
    section: 'account',
    group: 'This session',
    label: 'Sign out',
    description: 'Ends this session on this device.',
    keywords: ['log out', 'logout', 'leave'],
    control: <SignOutControl />,
  },

  {
    id: 'docs',
    section: 'developers',
    group: 'API',
    label: 'API documentation',
    description: 'Reference and guides. Opens in a new tab.',
    keywords: ['docs', 'reference', 'guide', 'external'],
    control: <DocsLink />,
  },
  {
    id: 'api-url',
    section: 'developers',
    group: 'API',
    label: 'API base URL',
    description: 'The server this app talks to.',
    keywords: ['endpoint', 'host', 'server', 'copy', 'env'],
    control: <ApiBaseUrl />,
  },
  {
    id: 'api-keys',
    section: 'developers',
    group: 'API',
    label: 'API keys',
    description: 'There is no key management yet, so nothing to create or revoke.',
    keywords: ['token', 'secret', 'credentials'],
    control: <ApiKeys />,
  },
];

/** Rows whose label, description, keywords, group or section name contain every word of the query. */
export function searchSettings(rows: readonly SettingDef[], query: string): SettingDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((r) => {
    const hay = [r.label, r.description ?? '', r.group, SECTION_TITLES[r.section], ...r.keywords]
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
