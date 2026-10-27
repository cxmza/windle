import { startTransition, useEffect, useRef, useState } from 'react';
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from '@/components/icons/lucide-animated';
import { useIconTrigger } from '@/components/icons/use-icon-trigger';
import { RailTip } from './RailTip';
import { SidebarContent } from './SidebarContent';

type Props = { collapsed: boolean; onToggle: () => void };

/** Longest running transition on the element, in ms; 0 when motion is off or CSS has none. */
function transitionMs(el: Element): number {
  const longest = getComputedStyle(el)
    .transitionDuration.split(',')
    .map((part) => Number.parseFloat(part))
    .filter(Number.isFinite)
    .reduce((max, seconds) => Math.max(max, seconds), 0);
  return longest * 1000;
}

export function Sidebar({ collapsed, onToggle }: Props) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const ref = useRef<HTMLElement>(null);
  const [iconActive, iconTrigger] = useIconTrigger();
  // The panel slides on the compositor with the full layout inside; the rail layout takes over once it has settled.
  const [settled, setSettled] = useState(collapsed);
  const rail = collapsed && settled;

  useEffect(() => {
    if (!collapsed) {
      setSettled(false);
      return;
    }
    const el = ref.current;
    const wait = el ? transitionMs(el) : 0;
    if (!el || wait === 0) {
      setSettled(true);
      return;
    }
    const done = () => startTransition(() => setSettled(true));
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'translate') done();
    };
    el.addEventListener('transitionend', onEnd);
    const id = window.setTimeout(done, wait + 100);
    return () => {
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(id);
    };
  }, [collapsed]);

  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <aside
      ref={ref}
      id="app-sidebar"
      data-sidebar
      data-collapsed={collapsed || undefined}
      data-rail={rail || undefined}
      className="fixed inset-y-0 left-0 z-(--z-header) hidden overflow-hidden border-r border-(--hairline) bg-surface md:block"
    >
      <div data-sidebar-body className="flex h-full flex-col">
        <SidebarContent
          rail={rail}
          headerAction={
            <RailTip label={label} active={rail}>
              <button
                type="button"
                onClick={onToggle}
                {...iconTrigger}
                aria-label={label}
                aria-expanded={!collapsed}
                aria-controls="app-sidebar"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground"
              >
                <ToggleIcon active={iconActive} />
              </button>
            </RailTip>
          }
        />
      </div>
    </aside>
  );
}
