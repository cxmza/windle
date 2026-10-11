import { lazy, Suspense, useEffect, useState } from 'react';
import { MarkPoster } from './MarkPoster';

const MarkScene = lazy(() => import('./MarkScene').then((m) => ({ default: m.MarkScene })));

const DESKTOP = '(min-width: 64rem)';

type Stage = 'poster' | 'armed' | 'live' | 'failed';

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

type NetworkInformation = { saveData?: boolean };

/** Arm the 3D chunk after first paint and an idle moment, never while the sign-in panel is still booting. */
function useArmed() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    // Below lg the panel is a short header: the poster is enough, and on a 4x-throttled CPU the 3D chunk blocks the
    // main thread for ~1.6 s (measured), which the sign-in panel must never wait for.
    if (!window.matchMedia?.(DESKTOP).matches) return;
    if (conn?.saveData || !webglAvailable()) return;
    let cancelled = false;
    let idle = 0;
    let timer = 0;
    const arm = () => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === 'function') {
        idle = window.requestIdleCallback(() => setArmed(true), { timeout: 1500 });
      } else {
        timer = window.setTimeout(() => setArmed(true), 300);
      }
    };
    if (document.readyState === 'complete') arm();
    else window.addEventListener('load', arm, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', arm);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, []);
  return armed;
}

/** Left panel on desktop, header block on mobile: the windle mark in real 3D under heavy type. */
export function BrandPanel({ className }: { className?: string }) {
  const armed = useArmed();
  const [stage, setStage] = useState<Stage>('poster');
  const showScene = armed && stage !== 'failed';
  const live = stage === 'live';

  return (
    <aside aria-label="windle" className={`brand ${className ?? ''}`} data-live={live || undefined}>
      <div className="brand-stage" aria-hidden="true">
        <div className="brand-light" />
        <MarkPoster />
        {showScene ? (
          <Suspense fallback={null}>
            <MarkScene
              reduced={prefersReducedMotion()}
              onReady={() => setStage('live')}
              onFail={() => setStage('failed')}
            />
          </Suspense>
        ) : null}
        <div className="brand-grain" />
      </div>

      <p className="brand-meta">
        <span>SOLANA</span>
        <span aria-hidden="true">·</span>
        <span>COLLATERAL</span>
        <span aria-hidden="true">·</span>
        <span>VERDICT</span>
      </p>

      <p className="brand-headline">
        <span>Keep</span> <span>your</span> <span>word.</span>
      </p>

      <p className="brand-hint" aria-hidden="true">
        Drag to turn
      </p>
    </aside>
  );
}
