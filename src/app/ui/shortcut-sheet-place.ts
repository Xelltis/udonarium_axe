import { SpotRect, SpotSize } from '@axe/ui/panel-spot';

/** How far the sheet keeps from the edges of the screen. */
export const SHORTCUT_SHEET_MARGIN = 16;
const STEP = 16;
/** How far the sheet keeps from what it is avoiding, so that it does not sit flush against a name. */
const CLEARANCE = 8;

/**
 * Where to put the cheat sheet, and in which of the shapes it can take, so that it covers as little
 * as it can of the names the guide writes.
 *
 * The bars and the menu are dragged wherever the reader likes, so no one place is always clear of
 * them, and on a small screen the names leave only a band to spare. The sheet can be laid out
 * narrow and tall or wide and short, so each shape it was measured in is tried at places on a grid
 * across the screen. The least covered wins; of those that cover the same, the earlier shape, and
 * then the place nearest the middle of the screen. A sheet bigger than the screen is put at its
 * top left corner.
 */
export function shortcutSheetPlace(
  shapes: readonly SpotSize[],
  viewport: SpotSize,
  avoid: readonly SpotRect[]
): { left: number; top: number; width: number } {
  let best = { left: 0, top: 0, width: shapes[0]?.width ?? 0 };
  let bestCover = Infinity;

  for (const size of shapes) {
    const middleLeft = (viewport.width - size.width) / 2;
    const middleTop = (viewport.height - size.height) / 2;
    let shapeBest = { left: 0, top: 0 };
    let shapeCover = Infinity;
    let shapeDistance = Infinity;

    for (const top of stops(viewport.height, size.height, middleTop)) {
      for (const left of stops(viewport.width, size.width, middleLeft)) {
        const cover = coverOf({ left, top, right: left + size.width, bottom: top + size.height }, avoid);
        const distance = (left - middleLeft) ** 2 + (top - middleTop) ** 2;
        if (cover < shapeCover || (cover === shapeCover && distance < shapeDistance)) {
          shapeBest = { left, top };
          shapeCover = cover;
          shapeDistance = distance;
        }
      }
    }
    if (shapeCover < bestCover) {
      best = { left: Math.round(shapeBest.left), top: Math.round(shapeBest.top), width: size.width };
      bestCover = shapeCover;
    }
  }
  return best;
}

/** The places tried along one side of the screen: a step apart, the far end, and the middle. */
function stops(room: number, length: number, middle: number): number[] {
  const last = Math.max(SHORTCUT_SHEET_MARGIN, room - length - SHORTCUT_SHEET_MARGIN);
  const places = [last, Math.min(Math.max(middle, SHORTCUT_SHEET_MARGIN), last)];
  for (let at = SHORTCUT_SHEET_MARGIN; at < last; at += STEP) places.push(at);
  return places;
}

function coverOf(sheet: SpotRect, avoid: readonly SpotRect[]): number {
  let cover = 0;
  for (const rect of avoid) {
    const width = Math.min(sheet.right, rect.right + CLEARANCE) - Math.max(sheet.left, rect.left - CLEARANCE);
    const height = Math.min(sheet.bottom, rect.bottom + CLEARANCE) - Math.max(sheet.top, rect.top - CLEARANCE);
    if (width > 0 && height > 0) cover += width * height;
  }
  return cover;
}
