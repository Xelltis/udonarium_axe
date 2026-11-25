/** How far a piece's detail stands from the pointer, across and up or down, in pixels. */
export const DETAIL_GAP_ACROSS_PX = 100;
export const DETAIL_GAP_UPRIGHT_PX = 50;

/**
 * Where a piece's detail opens beside the pointer, its top left corner in the page's pixels: to the
 * right of the pointer and above it, with its foot a little above, so that it covers neither the
 * pointer nor the piece under it. Where it does not fit above, it opens as far below; to the left
 * where it does not fit to the right. Only where it fits neither above nor below is it pushed inside
 * the screen, where it may cover the pointer.
 */
export function detailPlacement(
  pointer: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  screen: { readonly width: number; readonly height: number }
): { left: number; top: number } {
  let left = pointer.x + DETAIL_GAP_ACROSS_PX;
  if (left + size.width > screen.width) left = pointer.x - size.width - DETAIL_GAP_ACROSS_PX;
  left = Math.max(0, Math.min(left, screen.width - size.width));

  const above = pointer.y - size.height - DETAIL_GAP_UPRIGHT_PX;
  const below = pointer.y + DETAIL_GAP_UPRIGHT_PX;
  let top = above;
  if (above < 0) top = below + size.height <= screen.height ? below : Math.max(0, screen.height - size.height);
  return { left: Math.max(0, left), top: Math.max(0, top) };
}
