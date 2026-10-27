import type { ApiMarket } from '@windle/shared';
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { usePosition } from '../hooks';
import { ActivityList } from './ActivityList';
import { MarketCriteria } from './MarketCriteria';
import { PositionCard } from './PositionCard';
import { ResolutionSection } from './ResolutionSection';

type TabId = 'position' | 'trades' | 'resolution';

const TABS = [
  { value: 'position', label: 'My position' },
  { value: 'trades', label: 'Trades' },
  { value: 'resolution', label: 'Resolution' },
] as const satisfies readonly { value: TabId; label: string }[];

const trigger =
  'relative inline-flex min-h-11 items-center px-4 text-sm font-medium text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_var(--accent-text)] [@media(hover:hover)]:hover:text-foreground';

export function MarketTabs({ market, hidePayout }: { market: ApiMarket; hidePayout: boolean }) {
  const position = usePosition(market.slug);
  const holds = position !== null && (position.yesShares > 0 || position.noShares > 0 || position.settledAt !== null);
  const [chosen, setChosen] = useState<TabId | null>(null);
  const decides = market.status === 'closed' && market.viewer?.canResolve === true;
  const active = chosen ?? (holds ? 'position' : decides ? 'resolution' : 'trades');

  return (
    <Tabs.Root
      value={active}
      onValueChange={(v) => setChosen(TABS.find((t) => t.value === v)?.value ?? 'trades')}
      data-market-tabs
      className="flex min-w-0 flex-col"
    >
      <Tabs.List aria-label="Market details" className="flex overflow-x-auto border-b border-(--hairline)">
        {TABS.map((t) => (
          <Tabs.Trigger key={t.value} value={t.value} className={trigger}>
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="position" className="p-4 outline-none">
        <PositionCard
          market={market}
          hidePayout={hidePayout}
          bare
          empty={<p className="text-sm text-muted-foreground">You hold no position in this market yet.</p>}
        />
      </Tabs.Content>
      <Tabs.Content value="trades" className="p-4 outline-none">
        <ActivityList market={market} bare />
      </Tabs.Content>
      <Tabs.Content value="resolution" className="flex flex-col gap-5 p-4 outline-none">
        <MarketCriteria text={market.criteria} />
        <ResolutionSection market={market} bare />
      </Tabs.Content>
    </Tabs.Root>
  );
}
