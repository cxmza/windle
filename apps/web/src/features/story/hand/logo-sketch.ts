import { LOGO_SLOT_IDS, type LogoSlotId } from '../chapters';

/**
 * Sketch -> 3D handoff contract for the ecosystem logos.
 *
 * DOM (Ecosystem.tsx), one per slot id (`solana` | `pumpfun` | `x`):
 *   <div data-logo-slot="solana" data-logo-state="sketch">   the anchor: a square the 3D layer places the logo over
 *     <svg data-logo-sketch="solana">...</svg>              the hand-drawn outline (LOGO_SKETCHES in strokes.ts)
 *   </div>
 * and, next to it, a real label and link (those stay in the DOM; the 3D logo is decorative).
 *
 * Lifecycle, `data-logo-state` on the slot:
 *   sketch    initial: the finished sketch is visible (also what reduced motion and no-WebGL users keep)
 *   sketched  the hand has finished drawing it; `story:logo-sketched` has been dispatched
 *   extruded  the 3D layer has put the real logo in its place; the sketch is hidden
 *
 * Event: `story:logo-sketched` is a CustomEvent<{ slot: LogoSlotId }> dispatched on the slot element and bubbling,
 * so `window.addEventListener` receives it. Whoever animates the sketch (DOM motion) calls `markLogoSketched(slot)`
 * when the last stroke lands; the 3D layer listens with `onLogoSketched`, measures `[data-logo-slot=<id>]`
 * (getBoundingClientRect, re-measured on scroll/resize), extrudes the logo there and calls `markLogoExtruded(slot)`.
 * Scrolling back above the section: DOM motion calls `resetLogo(slot)`; the 3D layer retracts when `data-logo-state`
 * returns to `sketch`.
 */

export const LOGO_SKETCHED_EVENT = 'story:logo-sketched';

export type LogoSketchedDetail = { slot: LogoSlotId };
export type LogoSketchedEvent = CustomEvent<LogoSketchedDetail>;
export type LogoState = 'sketch' | 'sketched' | 'extruded';

declare global {
  interface WindowEventMap {
    [LOGO_SKETCHED_EVENT]: LogoSketchedEvent;
  }
}

export function isLogoSlotId(value: unknown): value is LogoSlotId {
  return typeof value === 'string' && (LOGO_SLOT_IDS as readonly string[]).includes(value);
}

export function logoSlotElement(slot: LogoSlotId, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-logo-slot="${slot}"]`);
}

function setState(slot: LogoSlotId, state: LogoState): HTMLElement | null {
  const el = logoSlotElement(slot);
  if (el) el.dataset.logoState = state;
  return el;
}

/** The hand finished the sketch: flips the slot to `sketched` and dispatches `story:logo-sketched`. */
export function markLogoSketched(slot: LogoSlotId): void {
  const el = setState(slot, 'sketched');
  const event: LogoSketchedEvent = new CustomEvent(LOGO_SKETCHED_EVENT, {
    detail: { slot },
    bubbles: true,
  });
  (el ?? window).dispatchEvent(event);
}

/** The 3D logo is in place: hides the sketch. */
export function markLogoExtruded(slot: LogoSlotId): void {
  setState(slot, 'extruded');
}

/** Back to the finished sketch (section left in reverse, or the 3D layer failed). */
export function resetLogo(slot: LogoSlotId): void {
  setState(slot, 'sketch');
}

/** Subscribe to the event; returns the unsubscribe function. */
export function onLogoSketched(handler: (slot: LogoSlotId, event: LogoSketchedEvent) => void): () => void {
  const listener = (event: LogoSketchedEvent) => handler(event.detail.slot, event);
  window.addEventListener(LOGO_SKETCHED_EVENT, listener);
  return () => window.removeEventListener(LOGO_SKETCHED_EVENT, listener);
}
