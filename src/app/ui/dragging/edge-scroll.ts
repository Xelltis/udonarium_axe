/** The band at the top and the bottom of a scrolling area that scrolls it while a drag is held there. */
export const EDGE_SCROLL_BAND_PX = 56;

/** The most a held drag scrolls its area in one frame. */
export const EDGE_SCROLL_MAX_STEP_PX = 18;

/**
 * How far to scroll an area this frame for a drag held at `y`: upward near its top, downward near
 * its bottom, faster the nearer the edge, and not at all in between.
 */
export function edgeScrollStep(
  y: number,
  area: { top: number; bottom: number },
  band = EDGE_SCROLL_BAND_PX,
  maxStep = EDGE_SCROLL_MAX_STEP_PX
): number {
  const reach = Math.min(band, (area.bottom - area.top) / 3);
  if (reach <= 0) return 0;
  if (y < area.top + reach) return -Math.ceil(maxStep * Math.min(1, (area.top + reach - y) / reach));
  if (y > area.bottom - reach) return Math.ceil(maxStep * Math.min(1, (y - (area.bottom - reach)) / reach));
  return 0;
}
