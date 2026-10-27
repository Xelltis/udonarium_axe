import type { ImageItem, ShapeItem } from '@axe/domain/map-editor/scene';

/**
 * Hit testing for the handles.
 *
 * Both the point and the tolerance are in **scene pixels**, before the zoom; the caller divides by it.
 * So zooming in makes a handle easier to grab and zooming out makes it harder.
 */

const ANCHOR_GRAB_PX = 7;
const HANDLE_GRAB_PX = 6;

/** Which anchor of a curve was grabbed, or -1 for none. */
export function curveAnchorAt(item: ShapeItem, x: number, y: number): number {
  const p = item.points;
  for (let i = 0; i * 2 + 1 < p.length; i += 1) {
    if (Math.abs(x - p[i * 2]) <= ANCHOR_GRAB_PX && Math.abs(y - p[i * 2 + 1]) <= ANCHOR_GRAB_PX) return i;
  }
  return -1;
}

/** The four corners of an image, clockwise from the top left. */
export function imageCorners(item: ImageItem): { x: number; y: number }[] {
  const hw = item.w / 2;
  const hh = item.h / 2;
  return [
    { x: item.x - hw, y: item.y - hh },
    { x: item.x + hw, y: item.y - hh },
    { x: item.x + hw, y: item.y + hh },
    { x: item.x - hw, y: item.y + hh },
  ];
}

/** Which corner of an image was grabbed, or -1 for none. */
export function imageHandleAt(item: ImageItem, x: number, y: number): number {
  const corners = imageCorners(item);
  for (let i = 0; i < corners.length; i += 1) {
    if (Math.abs(x - corners[i].x) <= HANDLE_GRAB_PX && Math.abs(y - corners[i].y) <= HANDLE_GRAB_PX) return i;
  }
  return -1;
}

/** How large an image lands. Anything too big is fitted into eight cells. */
export function fitImageSize(naturalW: number, naturalH: number, cellPx: number): { w: number; h: number } {
  const w = naturalW > 0 ? naturalW : 4 * cellPx;
  const h = naturalH > 0 ? naturalH : 4 * cellPx;
  const max = 8 * cellPx;
  const longest = Math.max(w, h);
  const ratio = longest > max ? max / longest : 1;
  return { w: w * ratio, h: h * ratio };
}
