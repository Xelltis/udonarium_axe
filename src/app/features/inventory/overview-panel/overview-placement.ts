/** How far a piece's detail stands from the pointer across, in pixels. */
export const DETAIL_GAP_ACROSS_PX = 100;
/** How far a piece's detail stands from the pointer up or down, in pixels. */
export const DETAIL_GAP_UPRIGHT_PX = 50;

/**
 * Where a piece's detail opens beside the pointer, its top left corner in the page's pixels: to the
 * right of the pointer and above it, with its foot a little above, so that it covers neither the
 * pointer nor the piece under it. Where it does not fit above, it opens as far below; to the left
 * where it does not fit to the right. Only where it fits neither above nor below is it pushed inside
 * the screen, where it may cover the pointer.
 *
 * A detail turned to face a reader at another edge of the table, a quarter turn at a time about its
 * top left corner, is placed so by the box it is seen in on the screen, and the corner it turns about
 * is answered for that box.
 */
export function detailPlacement(
  pointer: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  screen: { readonly width: number; readonly height: number },
  rotationDegrees = 0
): { left: number; top: number } {
  const turn = (((Math.round(rotationDegrees / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const across = turn % 2 === 1;
  const seen = across ? { width: size.height, height: size.width } : size;

  let left = pointer.x + DETAIL_GAP_ACROSS_PX;
  if (left + seen.width > screen.width) left = pointer.x - seen.width - DETAIL_GAP_ACROSS_PX;
  left = Math.max(0, Math.min(left, screen.width - seen.width));

  const above = pointer.y - seen.height - DETAIL_GAP_UPRIGHT_PX;
  const below = pointer.y + DETAIL_GAP_UPRIGHT_PX;
  let top = above;
  if (above < 0) top = below + seen.height <= screen.height ? below : Math.max(0, screen.height - seen.height);
  left = Math.max(0, left);
  top = Math.max(0, top);

  const corner = [
    { left, top },
    { left: left + size.height, top },
    { left: left + size.width, top: top + size.height },
    { left, top: top + size.width },
  ];
  return corner[turn];
}
