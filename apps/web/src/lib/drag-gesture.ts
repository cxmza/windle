// Page-wide "a mark owns the pointer" flag, shared by the 2D jelly marks (brand/use-jelly.ts), the 3D scene mark
// (scene/use-mark.ts) and the pencil layer (PencilCursor.tsx). It lives on <html> as an attribute so any layer can
// read it without a subscription, and so CSS could react to it too.

/** Present while a mark shows a grab affordance or is being dragged; value is the cursor in use. */
export const DRAG_CURSOR_ATTR = 'data-drag-cursor';

export type DragCursor = '' | 'grab' | 'grabbing';

/**
 * Sets the system cursor on the root element (DOM content covers the canvas, so a cursor set on the canvas would
 * never show) and mirrors it into DRAG_CURSOR_ATTR. '' clears both.
 */
export function setDragCursor(value: DragCursor): void {
  const root = document.documentElement;
  if ((root.getAttribute(DRAG_CURSOR_ATTR) ?? '') === value) return; // called per pointer move: write only on change
  root.style.cursor = value;
  if (value) root.setAttribute(DRAG_CURSOR_ATTR, value);
  else root.removeAttribute(DRAG_CURSOR_ATTR);
}

/** True while a mark has the pointer (grab affordance or an active drag): the pencil layer steps aside. */
export function dragCursorActive(): boolean {
  return document.documentElement.hasAttribute(DRAG_CURSOR_ATTR);
}
