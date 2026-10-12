import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuthedSession } from '@/features/session/session-context';
import { useClock } from '@/lib/clock';
import { useReducedMotion, webglAvailable } from '@/lib/media';
import { LiveTicker } from '../live/LiveTicker';
import { useLiveDriver } from '../live/use-live';
import { deadlineLabel } from './format';
import { MarketList } from './MarketList';
import { MarketPanel } from './MarketPanel';
import { createSceneBridge, poke } from './scene-bridge';
import { fixtureSource, marketsQuery } from './source';
import { TopBar } from './TopBar';
import { isOpen, type Market } from './types';
import { type View, ViewToggle } from './ViewToggle';

const MarketsScene = lazy(() => import('./scene/MarketsScene').then((m) => ({ default: m.MarketsScene })));

const byDeadline = (a: Market, b: Market) => Date.parse(a.deadline) - Date.parse(b.deadline);

type OpenState = { opened?: true } | null;

export function MarketsHome() {
  const { session, signOut } = useAuthedSession();
  const source = fixtureSource;
  const query = useQuery(marketsQuery(source));
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();
  const [webgl] = useState(webglAvailable);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [bridge] = useState(createSceneBridge);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLiveDriver();

  const sceneAvailable = webgl && !failed;
  const requested = params.get('view');
  const view: View =
    requested === 'list'
      ? 'list'
      : requested === 'scene'
        ? sceneAvailable
          ? 'scene'
          : 'list'
        : sceneAvailable && !reduced
          ? 'scene'
          : 'list';

  const now = useClock(view === 'scene' ? 'minute' : 'second');
  const markets = query.data ?? [];
  const open = markets.filter(isOpen).sort(byDeadline);
  const settled = markets.filter((m) => !isOpen(m)).sort((a, b) => byDeadline(b, a));
  const selectedId = params.get('m');
  const selected = markets.find((m) => m.id === selectedId) ?? null;

  const [shown, setShown] = useState<Market | null>(null);
  if (selected && selected !== shown) setShown(selected);

  const openMarket = (id: string, trigger?: HTMLElement) => {
    if (id === selectedId) return;
    returnFocus.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const next = new URLSearchParams(params);
    next.set('m', id);
    // switching between markets replaces; the first open pushes, so Back closes it
    setParams(next, {
      replace: Boolean(selectedId),
      state: selectedId ? location.state : ({ opened: true } satisfies OpenState),
    });
  };

  const closeMarket = () => {
    if (!selectedId) return;
    if ((location.state as OpenState)?.opened) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('m');
    setParams(next, { replace: true });
  };

  const setView = (v: View) => {
    if (v === view) return;
    const next = new URLSearchParams(params);
    next.set('view', v);
    if (v === 'scene') setReady(false);
    setParams(next, { replace: true, state: location.state });
  };

  useEffect(() => {
    bridge.selected = selected?.id ?? null;
    poke(bridge);
  }, [bridge, selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMarket();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const hadSelection = useRef(false);
  useEffect(() => {
    if (selected) {
      hadSelection.current = true;
      return;
    }
    if (!hadSelection.current) return;
    hadSelection.current = false;
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
    else document.getElementById('main')?.focus({ preventScroll: true });
  }, [selected]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!selected || !panel) {
      bridge.cover = { right: 0, bottom: 0, top: 0 };
      bridge.wake();
      return;
    }
    const measure = () => {
      const wide = window.matchMedia?.('(min-width: 48rem)').matches ?? true;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nav = document.querySelector('[data-topbar]')?.getBoundingClientRect().bottom ?? 0;
      const top = Math.max(0, nav / h);
      bridge.cover = wide
        ? { right: Math.max(0, (w - panel.offsetLeft) / w), bottom: 0, top }
        : { right: 0, bottom: Math.max(0, (h - panel.offsetTop) / h), top };
      bridge.wake();
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(panel);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [bridge, selected]);

  const scene = view === 'scene';

  return (
    <div className="relative min-h-dvh bg-nebula" data-scene-ready={(scene && ready) || undefined}>
      <title>Markets — windle</title>
      <TopBar address={session.address} onSignOut={signOut.run} signingOut={signOut.pending} />

      {signOut.failed ? (
        <div
          role="alert"
          className="fixed inset-x-(--gutter) top-[calc(var(--topbar-height)+var(--nav-offset)*2)] z-(--z-dock) mx-auto max-w-md rounded-3xl border border-(--hairline) bg-(--panel-surface) px-5 py-3 text-sm"
        >
          Could not sign out. Check your connection and try again.
        </div>
      ) : null}

      <main id="main" tabIndex={-1} className="outline-none">
        {scene ? (
          <section aria-labelledby="markets-title" className="fixed inset-0 overflow-hidden">
            <h1 id="markets-title" className="sr-only">
              Markets
            </h1>
            {!ready ? (
              <p
                role="status"
                className="absolute inset-x-0 bottom-[calc(var(--chrome-bottom)+5rem)] text-center text-kicker uppercase text-muted-foreground"
              >
                Loading the scene…
              </p>
            ) : null}
            <div data-scene-canvas className="absolute inset-0">
              {open.length > 0 ? (
                <Suspense fallback={null}>
                  <MarketsScene
                    markets={open}
                    now={now}
                    bridge={bridge}
                    reduced={reduced}
                    onOpen={(id) => openMarket(id)}
                    onClose={closeMarket}
                    onReady={() => setReady(true)}
                    onFail={() => setFailed(true)}
                  />
                </Suspense>
              ) : null}
            </div>

            <ul
              aria-label="Markets in the scene"
              className="pointer-events-none absolute top-[calc(var(--topbar-height)+var(--nav-offset)*2)] left-(--gutter)"
            >
              {open.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onFocus={() => {
                      bridge.focused = m.id;
                      poke(bridge);
                    }}
                    onBlur={() => {
                      if (bridge.focused === m.id) bridge.focused = null;
                      poke(bridge);
                    }}
                    onClick={(e) => openMarket(m.id, e.currentTarget)}
                    data-glass
                    className="pointer-events-auto sr-only px-4 py-2 text-sm focus:not-sr-only focus:inline-flex focus:gap-2"
                  >
                    <span className="font-semibold tracking-[0.12em] text-accent-text">${m.ticker}</span>
                    <span>{m.shipProbability}% ship</span>
                    <span className="text-muted-foreground">{deadlineLabel(m, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="mx-auto w-full max-w-6xl px-(--gutter) pt-[calc(var(--topbar-height)+var(--nav-offset)+3rem)] pb-[calc(var(--chrome-bottom)+6rem)]">
            <header className="mb-10 flex flex-col gap-3 px-3 md:px-4">
              <h1 id="markets-title" className="font-display text-split font-black lowercase">
                markets
              </h1>
              <p className="max-w-prose text-lede text-muted-foreground">
                Teams lock collateral behind an onchain-checkable promise. Take a side: it ships, or it gets slashed.
              </p>
              {source.sample ? (
                <p className="text-xs text-muted-foreground">sample data · trading opens at launch</p>
              ) : null}
            </header>
            {query.isError ? (
              <p role="alert" className="px-4 text-sm">
                Markets could not be loaded.
              </p>
            ) : (
              <MarketList
                open={open}
                settled={settled}
                now={now}
                selectedId={selected?.id ?? null}
                onOpen={openMarket}
              />
            )}
          </div>
        )}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-dock) flex items-end justify-between gap-3 px-(--gutter) pb-(--chrome-bottom)">
        <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-1.5 text-xs leading-snug text-muted-foreground">
          <LiveTicker feed={source.live?.()} />
          {scene ? (
            <ul aria-label="How to read the scene" className="flex flex-col md:flex-row md:gap-2">
              <li>nearer = sooner</li>
              <li aria-hidden="true" className="max-md:hidden">
                ·
              </li>
              <li>bigger = more collateral</li>
              <li aria-hidden="true" className="max-md:hidden">
                ·
              </li>
              <li>blade = ship odds</li>
            </ul>
          ) : null}
          <p className="pointer-events-auto flex w-fit flex-wrap items-center gap-x-2 text-muted-foreground/80">
            {scene && !reduced ? <span className="max-md:hidden">drag to orbit ·</span> : null}
            {scene && source.sample ? <span>sample data</span> : null}
            {scene && settled.length > 0 ? (
              <button
                type="button"
                onClick={() => setView('list')}
                className="underline decoration-(--hairline) underline-offset-4 hover:text-foreground"
              >
                · {settled.length} settled in list
              </button>
            ) : null}
          </p>
          {failed ? <p role="status">The 3D view stopped (graphics context lost), showing the list.</p> : null}
        </div>
        <ViewToggle view={view} onChange={setView} sceneAvailable={sceneAvailable} />
      </div>

      <MarketPanel
        market={selected ?? shown}
        open={Boolean(selected)}
        onClose={closeMarket}
        panelRef={panelRef}
        sample={source.sample}
      />
    </div>
  );
}
