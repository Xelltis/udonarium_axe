/** Where the button sits, and how big the window it sits in is. */
export interface FabButtonBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface FabWindowSize {
  readonly width: number;
  readonly height: number;
}

/** Which way the drawer hangs from the button. */
export interface FabDrawerSide {
  readonly up: boolean;
  readonly left: boolean;
}

/**
 * The side of the button the drawer has room to open on.
 *
 * The half of the window the button has been put in settles it: a button in the lower half
 * opens upward, one in the right half opens leftward. Halves rather than measured room, so
 * that the drawer does not turn over while the hand is still moving the button about.
 */
export function fabDrawerSide(button: FabButtonBox, view: FabWindowSize): FabDrawerSide {
  return {
    up: button.top + button.height / 2 > view.height / 2,
    left: button.left + button.width / 2 > view.width / 2,
  };
}

/**
 * Where the drawer is hung, written as the classes that hang it.
 *
 * Only the corner it grows from changes. What is inside it keeps the order it was written
 * in, so the first thing on the list is at the top of the drawer whichever way it opened.
 */
export function fabDrawerPlaceClasses(side: FabDrawerSide): string {
  if (side.up) {
    return side.left
      ? 'bottom-[calc(100%+10px)] right-0 origin-bottom-right translate-y-4'
      : 'bottom-[calc(100%+10px)] left-0 origin-bottom-left translate-y-4';
  }
  return side.left
    ? 'top-[calc(100%+10px)] right-0 origin-top-right -translate-y-4'
    : 'top-[calc(100%+10px)] left-0 origin-top-left -translate-y-4';
}

/**
 * The side an item's name is written on.
 *
 * A name is written outward from the drawer, so a drawer against the right edge writes them
 * to its left; written the other way they would be off the screen.
 */
export function fabLabelSideClasses(side: FabDrawerSide): string {
  return side.left ? '[&_[data-label]]:after:right-[calc(100%+10px)] [&_[data-label]]:after:left-auto' : '';
}

/**
 * How the drawer is read when it is wide enough to hold two columns.
 *
 * Down a column and then the column to its left, the way a Japanese page is read, whichever
 * corner the drawer opened from. The order of what is in it is written once and never turned
 * round to suit the direction it grew in.
 */
export const FAB_COLUMN_CLASSES =
  '[&>*]:break-inside-avoid [&>*]:[direction:ltr] [@media(max-height:760px)]:[column-count:2] [@media(max-height:760px)]:[direction:rtl]';

/**
 * Where something opened from an item in the drawer is hung: beside the drawer, on the same side
 * the names of its items are written on, so it opens onto the screen rather than off it.
 */
export function fabPopoverSideClasses(side: FabDrawerSide): string {
  return side.left ? 'right-[calc(100%+10px)]' : 'left-[calc(100%+10px)]';
}

/** Where a menu opened beside the drawer is pinned, in px from the drawer's top or bottom edge. */
export interface FabSubmenuAnchor {
  readonly top: number | null;
  readonly bottom: number | null;
}

/** Where the item that opened a menu sits: within the drawer, and on the screen. */
export interface FabSubmenuOpenerBox {
  /** From the top of the drawer to the top of the item. */
  readonly offsetTop: number;
  readonly height: number;
  /** The height of the drawer the item is in. */
  readonly drawerHeight: number;
  /** From the top of the window to the middle of the item. */
  readonly centerInWindow: number;
  readonly windowHeight: number;
}

/**
 * Where a menu is pinned so that it opens level with the item it was opened from.
 *
 * An item in the upper half of the window has its menu hang down from the item's top edge; one in
 * the lower half has it rise from the item's bottom edge, so the menu grows into the half with room
 * and its first or last button sits beside the item.
 */
export function fabSubmenuAnchor(opener: FabSubmenuOpenerBox): FabSubmenuAnchor {
  if (opener.centerInWindow > opener.windowHeight / 2) {
    return { top: null, bottom: opener.drawerHeight - (opener.offsetTop + opener.height) };
  }
  return { top: opener.offsetTop, bottom: null };
}
