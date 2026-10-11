import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import { afterFirstPaint } from '@/lib/first-paint';

// three + R3F + drei live in their own chunk, fetched after first paint.
const loadScene = () => import('./scene/StoryScene');
const StoryScene = lazy(loadScene);

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
    let idle = 0;
    let timer = 0;
    // After first paint: start the chunk download right away, mount (WebGL context) in the next idle period.
    // Creating the context in a cold browser stalls the GPU process (~0.6 s measured); before FCP it delayed the
    // first frame's presentation.
    const cancel = afterFirstPaint(() => {
      void loadScene();
      if (typeof window.requestIdleCallback === 'function') {
        idle = window.requestIdleCallback(() => setMount(true), { timeout: 600 });
      } else timer = window.setTimeout(() => setMount(true), 200);
    });
    return () => {
      cancel();
      if (idle) window.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
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
