/** A button to be named, measured from the inside corner of the bar it sits on. */
export interface ButtonGuideTarget {
  readonly label: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The inside of the bar the names hang from. */
export interface ButtonGuideBar {
  readonly width: number;
  readonly height: number;
}

/** Which way the names hang: above or below the bar, and off its left or its right end. */
export interface ButtonGuideDirection {
  readonly up: boolean;
  readonly left: boolean;
}

/**
 * One name and the line that ties it to its button, as offsets from the inside of the bar.
 *
 * The line is drawn in two strokes: `drop` runs straight down (or up) from the button to the row the
 * name sits in, and `run` along that row to the name. Each offset of the name is null where the other
 * one of its pair places it: `top` counts down from the bar's top edge and `bottom` up from its bottom
 * edge, `left` across from its left edge and `right` back from its right edge.
 */
export interface ButtonGuideBubble {
  readonly label: string;
  readonly drop: { readonly left: number; readonly top: number; readonly height: number };
  readonly run: { readonly left: number; readonly top: number; readonly width: number };
  readonly bubble: {
    readonly top: number | null;
    readonly bottom: number | null;
    readonly left: number | null;
    readonly right: number | null;
  };
}

/** From the bar's edge to the nearest row of names, and from its end to the column they stand in. */
export const BUTTON_GUIDE_GAP_PX = 10;
/** From one row of names to the next, which leaves a little air under a name one line high. */
export const BUTTON_GUIDE_ROW_PX = 26;
/** How tall a name one line high is drawn, so the line meets it halfway up. */
export const BUTTON_GUIDE_BUBBLE_PX = 22;

/**
 * Where each name on a bar hangs: one under another in a column beyond the end of the bar, one row
 * for each button, and a line from each button down to its row and along it to its name.
 *
 * The button nearest the column takes the row nearest the bar, and each button further along takes
 * the row below. A line on its way down to its row therefore stops above every row that runs past it,
 * so no two lines cross and no line runs through a name, however long the names are. The column
 * stands off the end of the bar with the most window beyond it, which also keeps the names clear of
 * the drawer in the corner the bar is furthest from.
 */
export function buttonGuideLayout(
  targets: readonly ButtonGuideTarget[],
  bar: ButtonGuideBar,
  direction: ButtonGuideDirection
): ButtonGuideBubble[] {
  const named = targets
    .filter((target) => target.label.length > 0)
    .map((target) => ({ target, x: Math.round((target.left + target.right) / 2) }))
    .sort((a, b) => a.x - b.x);
  const last = named.length - 1;
  const column = direction.left ? -BUTTON_GUIDE_GAP_PX : bar.width + BUTTON_GUIDE_GAP_PX;

  return named.map(({ target, x }, order) => {
    const row = direction.left ? order : last - order;
    const reach = BUTTON_GUIDE_GAP_PX + row * BUTTON_GUIDE_ROW_PX;
    const run = direction.left ? { left: column, width: x - column } : { left: x, width: column - x };
    const across = direction.left
      ? { left: null, right: bar.width + BUTTON_GUIDE_GAP_PX }
      : { left: column, right: null };

    if (direction.up) {
      const middle = -(reach + BUTTON_GUIDE_BUBBLE_PX / 2);
      return {
        label: target.label,
        drop: { left: x, top: middle, height: target.top - middle },
        run: { ...run, top: middle },
        bubble: { top: null, bottom: bar.height + reach, ...across },
      };
    }
    const middle = bar.height + reach + BUTTON_GUIDE_BUBBLE_PX / 2;
    return {
      label: target.label,
      drop: { left: x, top: target.bottom, height: middle - target.bottom },
      run: { ...run, top: middle },
      bubble: { top: bar.height + reach, bottom: null, ...across },
    };
  });
}
