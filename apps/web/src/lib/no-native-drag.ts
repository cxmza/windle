const NO_DRAG = 'img, svg, a, button, canvas';

/**
 * Cancels the browser's native drag (the ghost image) for images, icons, links, buttons and canvases, page-wide.
 * CSS `-webkit-user-drag: none` covers Chromium and Safari; Firefox needs this. Pointer-driven gestures (the logo
 * jelly, scroll, the pencil) never use native DnD, so they are unaffected; text in body copy can still be dragged.
 */
export function preventNativeDrag(target: Document = document): () => void {
  const onDragStart = (event: DragEvent) => {
    const node = event.target;
    const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    if (el?.closest(NO_DRAG)) event.preventDefault();
  };
  target.addEventListener('dragstart', onDragStart, { capture: true });
  return () => target.removeEventListener('dragstart', onDragStart, { capture: true });
}
