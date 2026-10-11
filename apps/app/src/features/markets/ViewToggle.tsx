export type View = 'scene' | 'list';

type Props = {
  view: View;
  onChange: (view: View) => void;
  sceneAvailable: boolean;
};

const option =
  'relative z-10 inline-flex h-9 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors duration-(--dur-instant) ease-(--ease-standard) aria-pressed:text-ink-inverse not-aria-pressed:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40 [@media(hover:hover)]:not-aria-pressed:enabled:hover:text-foreground';

export function ViewToggle({ view, onChange, sceneAvailable }: Props) {
  return (
    <fieldset data-glass className="pointer-events-auto relative m-0 flex w-44 min-w-0 border-0 p-1">
      <legend className="sr-only">View</legend>
      <span
        aria-hidden="true"
        data-view-thumb
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-foreground"
        style={{ translate: view === 'list' ? '100% 0' : '0 0' }}
      />
      <button
        type="button"
        aria-pressed={view === 'scene'}
        disabled={!sceneAvailable}
        onClick={() => onChange('scene')}
        className={option}
      >
        Scene
      </button>
      <button type="button" aria-pressed={view === 'list'} onClick={() => onChange('list')} className={option}>
        List
      </button>
    </fieldset>
  );
}
