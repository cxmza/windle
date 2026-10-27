import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useClock } from '@/lib/clock';
import { useMediaQuery } from '@/lib/media';
import { cssDuration } from '@/lib/motion';
import { FeedColumn, type FeedMode } from '../feed/FeedColumn';
import { FeedToggle } from '../feed/FeedToggle';
import { type HomeTab, MobileTabs, TAB_IDS } from '../feed/MobileTabs';
import { useFeedOpen } from '../feed/use-feed-open';
import { useTweetFeed } from '../feed/use-tweet-feed';
import { MarketList } from './MarketList';

const FEED_ID = 'feed-panel';

const panel = (tab: HomeTab, narrow: boolean) =>
  narrow ? { id: TAB_IDS[tab].panel, role: 'tabpanel', 'aria-labelledby': TAB_IDS[tab].tab } : {};

export function MarketsHome() {
  const [params] = useSearchParams();
  const now = useClock('second');
  const feed = useTweetFeed();
  const narrow = !useMediaQuery('(min-width: 48rem)');
  const wide = useMediaQuery('(min-width: 80rem)');
  const [drawerOpen, setDrawerOpen] = useFeedOpen();
  const [tab, setTab] = useState<HomeTab>('markets');
  const [switched, setSwitched] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(false), cssDuration('--dur-fast', 180) + 120);
    return () => window.clearTimeout(t);
  }, [leaving]);

  // Old links: `?m=<id>` opened a market over the 3D scene, `?view=` picked the scene or the list.
  const legacyMarket = params.get('m');
  if (legacyMarket) return <Navigate to={`/m/${encodeURIComponent(legacyMarket)}`} replace />;

  const mode: FeedMode | null = narrow ? 'page' : wide ? 'column' : drawerOpen || leaving ? 'overlay' : null;
  const closing = mode === 'overlay' && !drawerOpen;

  const closeDrawer = () => {
    setDrawerOpen(false);
    setLeaving(mode === 'overlay');
  };
  const showFeed = () => {
    if (narrow) {
      setTab('feed');
      setSwitched(true);
    } else {
      setLeaving(false);
      setDrawerOpen(true);
    }
  };
  const onTab = (next: HomeTab) => {
    setTab(next);
    setSwitched(true);
  };
  const paneIn = (hidden: boolean) => (switched && !hidden ? '' : undefined);
  const feedHidden = narrow && tab !== 'feed';
  const marketsHidden = narrow && tab !== 'markets';

  return (
    <div className="min-h-dvh">
      <title>Markets — windle</title>

      <div
        data-sidebar-flip
        data-markets-layout
        className="flex min-h-dvh w-full flex-col pt-(--menu-clearance) pb-[env(safe-area-inset-bottom,0px)]"
      >
        {narrow ? <MobileTabs value={tab} onValueChange={onTab} livePaused={feed.paused} /> : null}

        <div className="flex min-h-0 flex-1">
          {mode === 'overlay' ? (
            <div
              data-scrim
              data-sidebar-offset
              data-state={closing ? 'closed' : 'open'}
              aria-hidden="true"
              onClick={closeDrawer}
              className="fixed top-0 right-0 bottom-0 left-(--sidebar-w) z-(--z-hand) bg-scrim"
            />
          ) : null}

          {mode ? (
            <div
              {...panel('feed', narrow)}
              hidden={feedHidden}
              data-home-pane-in={paneIn(feedHidden)}
              className={mode === 'page' ? 'w-full' : 'contents'}
            >
              <FeedColumn
                feed={feed}
                mode={mode}
                id={FEED_ID}
                closing={closing}
                onClosed={() => setLeaving(false)}
                {...(mode === 'overlay' ? { onClose: closeDrawer } : {})}
              />
            </div>
          ) : null}

          <div
            {...panel('markets', narrow)}
            hidden={marketsHidden}
            data-home-pane-in={paneIn(marketsHidden)}
            className="@container min-w-0 flex-1"
          >
            <MarketList
              now={now}
              onShowFeed={mode === 'column' ? undefined : showFeed}
              actions={
                <FeedToggle
                  open={drawerOpen}
                  onToggle={() => {
                    if (drawerOpen) closeDrawer();
                    else {
                      setLeaving(false);
                      setDrawerOpen(true);
                    }
                  }}
                  controls={FEED_ID}
                  paused={feed.paused}
                />
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
