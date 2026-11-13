/** Where a panel stands and how large it is, in pixels. */
export interface PanelBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** How large the window a panel is drawn in is, in pixels. */
export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

/** The edges of a panel on screen, as `getBoundingClientRect` reads them. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The box that fills the window: a sideways panel fills it along its turned axes, so its box is
 * the window's turned a quarter and centred on it.
 */
export function fullScreenBox(view: ViewSize, sideways: boolean): PanelBox {
  const width = sideways ? view.height : view.width;
  const height = sideways ? view.width : view.height;
  return { left: (view.width - width) / 2, top: (view.height - height) / 2, width, height };
}

/**
 * How far a panel has to move to stand inside the window: one wider or taller than the window is
 * centred on it, one over an edge is brought back to that edge, and one inside it stays put.
 */
export function viewportShift(rect: ScreenRect, view: ViewSize): { x: number; y: number } {
  let x = 0;
  let y = 0;

  if (view.width < rect.width) x = view.width / 2 - (rect.left + rect.width / 2);
  else if (rect.left < 0) x = -rect.left;
  else if (view.width < rect.right) x = view.width - rect.right;

  if (view.height < rect.height) y = view.height / 2 - (rect.top + rect.height / 2);
  else if (rect.top < 0) y = -rect.top;
  else if (view.height < rect.bottom) y = view.height - rect.bottom;

  return { x, y };
}

/**
 * What to write on a panel to keep it at least as large as its content needs and inside the
 * window: a side that is too short is grown to the least, and a corner the least size would push
 * over the window's edge is pulled back, though never past the window's own corner. Nothing for
 * what is already as it should be; a width or height that could not be read is left alone.
 */
export function leastSizeCorrection(now: PanelBox, least: ViewSize, view: ViewSize): Partial<PanelBox> {
  const correction: { -readonly [K in keyof PanelBox]?: number } = {};
  if (now.width < least.width) correction.width = least.width;
  if (now.height < least.height) correction.height = least.height;

  const overRight = now.left + least.width - view.width;
  if (overRight >= 0) correction.left = Math.max(0, now.left - overRight);

  const overBottom = now.top + least.height - view.height;
  if (overBottom >= 0) correction.top = Math.max(0, now.top - overBottom);

  return correction;
}
