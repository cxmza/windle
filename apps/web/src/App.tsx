import { lazy, Suspense } from 'react';
import { SiteFooter } from '@/features/footer/SiteFooter';
import { SiteNav } from '@/features/nav/SiteNav';
import { Header } from '@/features/story/Header';
import { NotFound } from '@/features/story/NotFound';
import { chapterFromPath } from '@/features/story/routes';
import { Story } from '@/features/story/Story';
import { StoryCanvas } from '@/features/story/StoryCanvas';
import { useStoryRouting } from '@/features/story/story-nav';
import { useSmoothScroll } from '@/lib/smooth-scroll';

// Pointer-only overlays (pencil cursor, drawing hand + perfect-freehand): own chunks, requested on first render,
// never on the first-paint path.
const PencilCursor = lazy(() => import('@/features/story/PencilCursor').then((m) => ({ default: m.PencilCursor })));
const DrawingHand = lazy(() => import('@/features/story/hand/DrawingHand').then((m) => ({ default: m.DrawingHand })));

function StoryApp() {
  // Smooth scroll is part of the scrubbed storytelling feel; the hook skips itself under reduced motion.
  useSmoothScroll();
  // clean chapter paths: link clicks, scroll -> URL, back/forward, deep links
  useStoryRouting();
  return (
    <>
      <Header />
      <StoryCanvas />
      <SiteNav />
      <Story />
      <SiteFooter />
      <Suspense fallback={null}>
        <PencilCursor />
        <DrawingHand />
      </Suspense>
    </>
  );
}

export function App() {
  // Only the chapter paths exist (nginx serves index.html for exactly those); anything else is the 404 state.
  if (chapterFromPath(window.location.pathname) === null) return <NotFound />;
  return <StoryApp />;
}
