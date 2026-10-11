import { useEffect, useRef, useSyncExternalStore } from 'react';
import { REDUCED_MOTION_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { HAND_ART, HAND_HULL_PX, HAND_NIB_PX, HandArt } from './HandArt';
import { getHandState, subscribeHand } from './hand-bus';
import { followHand } from './hand-follow';

/**
 * The drawing hand: a fixed, click-through, aria-hidden overlay holding an engraved hand-with-pencil whose pencil
 * point follows the tip of whichever stroke the hand bus says is being drawn (hand-bus.ts). The motion (enter, spring
 * tracking, tilt, pen-lift hops, exit) lives in hand-follow.ts, outside React; this component only mounts it.
 * Idle: invisible. Not rendered under reduced motion (the finished drawings are already on the page) and hidden below
 * md (draw-on does not summon it there either, see hand-gate.ts).
 */
export function DrawingHand() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  if (reducedMotion) return null;
  return <HandLayer />;
}

function HandLayer() {
  const status = useSyncExternalStore(
    subscribeHand,
    () => getHandState().status,
    () => 'idle' as const,
  );
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    return followHand(body, HAND_NIB_PX, HAND_HULL_PX);
  }, []);

  return (
    <div
      aria-hidden="true"
      data-drawing-hand
      data-hand-state={status}
      className="pointer-events-none fixed inset-0 z-(--z-hand) overflow-hidden select-none max-md:hidden"
    >
      <div
        ref={bodyRef}
        data-drawing-hand-body
        data-hand-state={status}
        className="absolute top-0 left-0 text-ink opacity-0"
        style={{ width: HAND_ART.size, height: HAND_ART.size }}
      >
        <HandArt className="block size-full" />
      </div>
    </div>
  );
}
