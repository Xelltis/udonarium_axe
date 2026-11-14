import { clampOr } from '@axe/core/util/clamp';

/** A piece whose hover popup has a width and a greatest height of its own. */
export interface PopupSized {
  overViewWidth: number;
  overViewMaxHeight: number;
}

/** Sets the width of a piece's hover popup, held between 270 and 800 pixels; anything not a number keeps the width it had. */
export function setPopupWidth(piece: PopupSized, width: number): void {
  piece.overViewWidth = clampOr(width, 270, 800, piece.overViewWidth);
}

/**
 * Sets the greatest height of a piece's hover popup, held between 250 and 1000 pixels; anything not
 * a number keeps the height it had.
 */
export function setPopupMaxHeight(piece: PopupSized, maxHeight: number): void {
  piece.overViewMaxHeight = clampOr(maxHeight, 250, 1000, piece.overViewMaxHeight);
}
