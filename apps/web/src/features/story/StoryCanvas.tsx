import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import { afterFirstPaint } from '@/lib/first-paint';
import { whenIdle } from '@/lib/idle';

// three + R3F + drei live in their own chunk, fetched after first paint.
const loadScene = () => import('./scene/StoryScene');
const StoryScene = lazy(loadScene);
/** Same breakpoint as the scene's layout (scene/StoryScene.tsx): it picks the mark's geometry tier. */
const NARROW_QUERY = '(max-width: 767px)';

function canUseWebGL(): boolean {
  return typeof window !== 'undefined' && typeof window.WebGL2RenderingContext !== 'undefined';
}

/** If WebGL context creation fails, keep the CSS nebula poster instead of crashing the page. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Fixed full-viewport layer behind all content: one persistent three.js scene whose objects hand off per chapter
 * (see scene/poses.ts) in front of a shader nebula (scene/nebula.ts; it also carries the static grain).
 * The layer's own background is a CSS poster of the hero nebula (--backdrop-nebula): it paints with the first
 * commit, long before the 3D chunk arrives, and the canvas fades in over it.
 */
export function StoryCanvas() {
  const [mount, setMount] = useState(false);

  useEffect(() => {
    if (!canUseWebGL()) return;
    let cancelled = false;
    const jobs: Array<() => void> = [];
    // After first paint: start the chunk download right away. Once it has arrived, build the scene's geometries one
    // per idle period (scene/prepared.ts; they used to be built inside the mount task), then mount (WebGL context)
    // in the idle period after. Creating the context in a cold browser stalls the GPU process (~0.6 s measured);
    // before FCP it delayed the first frame's presentation.
    const cancel = afterFirstPaint(() => {
      loadScene().then(
        (scene) => {
          if (cancelled) return;
          const narrow = window.matchMedia(NARROW_QUERY).matches;
          for (const job of scene.sceneWarmJobs(narrow)) jobs.push(whenIdle(job));
          jobs.push(whenIdle(() => setMount(true)));
        },
        // the lazy import fails again on mount and SceneBoundary keeps the CSS poster
        () => {
          if (!cancelled) setMount(true);
        },
      );
    });
    return () => {
      cancelled = true;
      cancel();
      for (const cancelJob of jobs) cancelJob();
    };
  }, []);

  return (
    <div
      data-story-canvas
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background [background-image:var(--backdrop-nebula)]"
    >
      {mount && (
        <SceneBoundary>
          <Suspense fallback={null}>
            <StoryScene />
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  );
}
