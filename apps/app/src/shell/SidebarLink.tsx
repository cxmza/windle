import type { ComponentType } from 'react';
import { NavLink } from 'react-router';
import type { AnimatedIconProps } from '@/components/icons/icon-base';
import { useIconTrigger } from '@/components/icons/use-icon-trigger';
import { RailTip } from './RailTip';
import { railRowClass, rowClass } from './row-styles';

type Props = {
  to: string;
  label: string;
  Icon: ComponentType<AnimatedIconProps>;
  end?: boolean;
  rail: boolean;
  onNavigate?: (() => void) | undefined;
};

export function SidebarLink({ to, label, Icon, end, rail, onNavigate }: Props) {
  const [active, trigger] = useIconTrigger();
  return (
    <RailTip label={label} active={rail}>
      <NavLink
        to={to}
        end={end}
        onClick={onNavigate}
        {...trigger}
        className={`${rowClass} ${rail ? railRowClass : ''}`}
      >
        <Icon active={active} />
        <span data-sidebar-label className={rail ? 'sr-only' : 'truncate'}>
          {label}
        </span>
      </NavLink>
    </RailTip>
  );
}
