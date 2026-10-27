import { type FocusEvent, type PointerEvent, type RefCallback, useCallback, useState } from 'react';
import { useReducedMotion } from '@/lib/media';

function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

export type IconTriggerProps = {
  ref: RefCallback<HTMLElement>;
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
};

/**
 * Hover (mouse/pen) or keyboard focus on the whole row drives its icon.
 * Touch taps, pointer-initiated focus and reduced motion never start it.
 */
export function useIconTrigger(): [active: boolean, props: IconTriggerProps] {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // a row that unmounts under the pointer (menu item, drawer button) never gets pointerleave
  const ref = useCallback<RefCallback<HTMLElement>>(() => {
    return () => {
      setHovered(false);
      setFocused(false);
    };
  }, []);
  return [
    !reduced && (hovered || focused),
    {
      ref,
      onPointerEnter: (e) => {
        if (e.pointerType !== 'touch') setHovered(true);
      },
      onPointerLeave: () => setHovered(false),
      onFocus: (e) => setFocused(focusVisible(e.currentTarget)),
      onBlur: () => setFocused(false),
    },
  ];
}
