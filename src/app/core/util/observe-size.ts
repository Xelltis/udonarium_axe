/** The size of an element's content box, in whole pixels. */
export interface ObservedSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Calls `onSize` with an element's content size, rounded to whole pixels, whenever it changes, from
 * when it is first laid out. Answers the function that stops watching, which does nothing where the
 * browser cannot watch sizes.
 */
export function observeSize(element: Element, onSize: (size: ObservedSize) => void): () => void {
  if (typeof ResizeObserver !== 'function') return () => undefined;
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) onSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
  });
  observer.observe(element);
  return () => observer.disconnect();
}
