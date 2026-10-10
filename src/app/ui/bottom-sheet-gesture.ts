/** A drag of a sheet's grip downward, as far as it went and how long it took. */
export interface SheetDrag {
  /** How far down the finger went, in pixels; upward counts as nothing. */
  dy: number;
  /** How long the finger was down, in milliseconds. */
  ms: number;
  /** How tall the sheet is, in pixels. */
  height: number;
}

/** How far down a sheet has to be pulled to close, at most. */
const DISMISS_DISTANCE_PX = 160;

/** The share of a short sheet's height that closes it when pulled that far. */
const DISMISS_SHARE = 0.35;

/** How quick a flick has to be to close the sheet, in pixels per millisecond. */
const FLICK_SPEED = 0.6;

/** The least a flick has to travel, so a tap on the grip does not close the sheet. */
const FLICK_MIN_PX = 24;

/**
 * Whether letting go of a sheet's grip closes it.
 *
 * Pulled down far enough, by a fixed distance or a share of a short sheet's height, it closes; so it
 * does when flicked down quickly. Anything less springs back.
 */
export function shouldDismissSheet(drag: SheetDrag): boolean {
  if (drag.dy <= 0) return false;
  if (drag.dy >= Math.min(DISMISS_DISTANCE_PX, drag.height * DISMISS_SHARE)) return true;
  return drag.dy >= FLICK_MIN_PX && drag.dy / Math.max(drag.ms, 1) >= FLICK_SPEED;
}

/** How far the sheet follows the finger: all the way down, and only a little upward. */
export function sheetDragOffset(dy: number): number {
  return dy >= 0 ? dy : dy / 6;
}
