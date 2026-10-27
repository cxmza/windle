import { Dialog } from 'radix-ui';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { useMediaQuery } from '@/lib/media';
import { ChevronLeftIcon, CloseIcon, CodeIcon, DisplayIcon, SearchIcon, SlidersIcon, UserIcon } from '@/shell/icons';
import { rowClass } from '@/shell/row-styles';
import { parseSettingsSection, SETTINGS_PARAM, type SettingsSection, settingsHref } from '@/shell/settings';
import { NAV_GROUPS, SECTION_TITLES, SETTINGS, type SettingDef, searchSettings } from './registry';
import { SettingRow } from './SettingRow';

const SECTION_ICONS: Record<SettingsSection, () => ReactNode> = {
  general: SlidersIcon,
  display: DisplayIcon,
  account: UserIcon,
  developers: CodeIcon,
};

const iconButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) max-md:size-11 active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground';

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
      >
        <SearchIcon />
      </span>
      <input
        type="search"
        aria-label="Search settings"
        placeholder="Search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-(--control-border) bg-background pr-3 pl-9 text-sm text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) placeholder:text-muted-foreground max-md:h-11 [@media(hover:hover)]:hover:bg-(--hover)"
      />
    </div>
  );
}

function SectionNav({ section, onSelect }: { section: SettingsSection; onSelect: (s: SettingsSection) => void }) {
  const location = useLocation();
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <h3 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h3>
          <ul className="flex flex-col gap-0.5">
            {group.sections.map((id) => {
              const Icon = SECTION_ICONS[id];
              return (
                <li key={id}>
                  <Link
                    to={settingsHref(location, id)}
                    replace
                    aria-current={id === section ? 'page' : undefined}
                    onClick={() => onSelect(id)}
                    className={rowClass}
                  >
                    <Icon />
                    {SECTION_TITLES[id]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Rows({ rows }: { rows: readonly SettingDef[] }) {
  return (
    <div>
      {rows.map((r) => (
        <SettingRow key={r.id} label={r.label} description={r.description} stacked={r.stacked ?? false}>
          {r.control}
        </SettingRow>
      ))}
    </div>
  );
}

function SectionView({ section }: { section: SettingsSection }) {
  const rows = SETTINGS.filter((r) => r.section === section);
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g} aria-label={groups.length > 1 ? g : undefined} className="flex flex-col">
          {groups.length > 1 ? <h3 className="pt-1 pb-1 text-sm font-semibold text-foreground">{g}</h3> : null}
          <Rows rows={rows.filter((r) => r.group === g)} />
        </section>
      ))}
    </div>
  );
}

function Results({ query, onClear }: { query: string; onClear: () => void }) {
  const found = searchSettings(SETTINGS, query);
  if (found.length === 0) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 py-6">
        <p className="text-sm text-muted-foreground">No settings match “{query.trim()}”.</p>
        <Button variant="secondary" onClick={onClear} className="min-h-9 px-4">
          Clear search
        </Button>
      </div>
    );
  }
  const sections = NAV_GROUPS.flatMap((g) => g.sections).filter((s) => found.some((r) => r.section === s));
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        {found.length} {found.length === 1 ? 'setting' : 'settings'} found
      </p>
      {sections.map((s) => (
        <section key={s} aria-label={SECTION_TITLES[s]} className="flex flex-col">
          <h3 className="pt-1 pb-1 text-sm font-semibold text-foreground">{SECTION_TITLES[s]}</h3>
          <Rows rows={found.filter((r) => r.section === s)} />
        </section>
      ))}
    </div>
  );
}

/** How the next pane view arrives on the mobile stack. Desktop sections swap instantly and carry no direction. */
type PaneDir = 'forward' | 'back';

type PanelProps = { section: SettingsSection; onSelect: (s: SettingsSection) => void };

function SettingsPanel({ section, onSelect }: PanelProps) {
  const wide = useMediaQuery('(min-width: 48rem)');
  const [query, setQuery] = useState('');
  const [pane, setPane] = useState<'list' | 'section'>(section === 'general' ? 'list' : 'section');
  const [dir, setDir] = useState<PaneDir | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const searching = query.trim() !== '';
  const clear = () => setQuery('');

  const pick = (s: SettingsSection) => {
    clear();
    setPane('section');
    setDir(wide ? null : 'forward');
    onSelect(s);
  };
  const back = () => {
    setPane('list');
    setDir('back');
  };

  const title = searching ? 'Search results' : !wide && pane === 'list' ? 'Settings' : SECTION_TITLES[section];
  const showBack = !wide && !searching && pane === 'section';
  const view = searching ? 'search' : !wide && pane === 'list' ? 'list' : `section:${section}`;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && view) el.scrollTop = 0;
  }, [view]);

  return (
    <div className="flex min-h-0 flex-1">
      {wide ? (
        <div className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-(--hairline) p-3 [scrollbar-gutter:stable]">
          <SearchField value={query} onChange={setQuery} />
          <SectionNav section={section} onSelect={pick} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2 md:px-6 md:pt-5">
          {showBack ? (
            <button type="button" aria-label="Back to settings" onClick={back} className={iconButton}>
              <ChevronLeftIcon />
            </button>
          ) : null}
          <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold md:pl-0 max-md:pl-1">
            {title}
          </Dialog.Title>
          <Dialog.Close asChild>
            <button type="button" aria-label="Close settings" className={iconButton}>
              <CloseIcon />
            </button>
          </Dialog.Close>
        </header>

        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8 [scrollbar-gutter:stable] md:px-6"
        >
          {!wide && pane === 'list' ? (
            <div data-pane-view data-dir={dir === 'back' ? dir : undefined} className="flex flex-col gap-4 pb-2">
              <SearchField value={query} onChange={setQuery} />
              {searching ? null : <SectionNav section={section} onSelect={pick} />}
            </div>
          ) : null}
          {searching ? (
            <Results query={query} onClear={clear} />
          ) : wide || pane === 'section' ? (
            <div key={view} data-pane-view data-dir={dir === 'forward' ? dir : undefined}>
              <SectionView section={section} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const [params, setParams] = useSearchParams();
  const raw = params.get(SETTINGS_PARAM);
  const fromUrl = parseSettingsSection(raw);
  const [shown, setShown] = useState({ url: fromUrl, section: fromUrl });
  if (shown.url !== fromUrl) setShown({ url: fromUrl, section: fromUrl });
  const section = shown.section;
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);

  const update = (apply: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    apply(next);
    setParams(next, { replace: true });
  };

  return (
    <Dialog.Root
      open={raw !== null}
      onOpenChange={(open) => {
        if (!open) update((next) => next.delete(SETTINGS_PARAM));
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay data-scrim className="fixed inset-0 z-(--z-pencil) bg-scrim" />
        <Dialog.Content
          ref={content}
          aria-describedby={undefined}
          data-settings-dialog
          onOpenAutoFocus={(e) => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            e.preventDefault();
            const active = content.current?.querySelector<HTMLElement>('nav [aria-current=page]');
            (active ?? content.current)?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const back = opener.current?.isConnected && opener.current !== document.body ? opener.current : null;
            if (back) {
              back.focus();
              return;
            }
            for (const fallback of document.querySelectorAll<HTMLElement>('[data-settings-return]')) {
              fallback.focus();
              if (document.activeElement === fallback) break;
            }
          }}
          className="fixed z-(--z-pencil) flex flex-col overflow-hidden bg-surface text-foreground outline-none max-md:inset-0 max-md:pt-[env(safe-area-inset-top,0px)] max-md:pb-[env(safe-area-inset-bottom,0px)] md:top-1/2 md:left-1/2 md:h-[min(44rem,90dvh)] md:w-[min(60rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:border-(--control-border)"
        >
          <SettingsPanel
            section={section}
            onSelect={(s) => {
              setShown((prev) => ({ ...prev, section: s }));
              update((next) => next.set(SETTINGS_PARAM, s));
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
