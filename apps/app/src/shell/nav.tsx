import type { ComponentType } from 'react';
import type { AnimatedIconProps } from '@/components/icons/icon-base';
import { ChartColumnIncreasingIcon, SquarePenIcon, TrophyIcon, WalletIcon } from '@/components/icons/lucide-animated';

export type NavItem = { to: string; label: string; end?: boolean; Icon: ComponentType<AnimatedIconProps> };

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Markets', end: true, Icon: ChartColumnIncreasingIcon },
  { to: '/portfolio', label: 'Portfolio', Icon: WalletIcon },
  { to: '/leaderboard', label: 'Leaderboard', Icon: TrophyIcon },
  { to: '/create', label: 'Create', Icon: SquarePenIcon },
];
