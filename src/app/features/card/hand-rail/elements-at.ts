/**
 * Every HTML element under a point in the viewport, topmost first, used to tell whether a card was
 * let go of over the hand rail.
 *
 * Where `elementsFromPoint` is unavailable only the topmost element is returned.
 */
export function elementsAt(x: number, y: number): HTMLElement[] {
  if (typeof document.elementsFromPoint !== 'function') {
    const single = document.elementFromPoint(x, y);
    return single instanceof HTMLElement ? [single] : [];
  }
  return document.elementsFromPoint(x, y).filter((element): element is HTMLElement => element instanceof HTMLElement);
}
