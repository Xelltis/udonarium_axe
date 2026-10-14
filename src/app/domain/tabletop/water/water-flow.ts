/** The eight ways water can be set to flow, in degrees clockwise from the top of the table. */
export const FLOW_DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/** How many cells a second flowing water carries what floats on it at the top of the scale. */
const FASTEST_CELLS_PER_SECOND = 2.2;
/** How many cells a second the slowest flow that moves at all carries it. */
const SLOWEST_CELLS_PER_SECOND = 0.25;

/** Which way water flows across the table, as a unit step in table pixels: x to the right, y down. */
export function flowVectorOf(directionDeg: number): { x: number; y: number } {
  const turn = (directionDeg * Math.PI) / 180;
  return { x: round(Math.sin(turn)), y: round(-Math.cos(turn)) };
}

/**
 * Water flowing past the eye as the eye sees it, in cells a second: how fast it runs across the
 * view to the right, and how fast it comes at the eye (running away from it where negative).
 */
export interface SeenCurrent {
  readonly across: number;
  readonly toward: number;
}

/**
 * Water flowing past the eye as the eye sees it, given which way the eye looks along the ground
 * (`hx`, `hy`) and its right (`rx`, `ry`), as unit steps in table pixels; or null for still water.
 */
export function currentSeenFrom(
  eye: { readonly hx: number; readonly hy: number; readonly rx: number; readonly ry: number },
  directionDeg: number,
  cellsPerSecond: number
): SeenCurrent | null {
  if (!(cellsPerSecond > 0)) return null;
  const turn = (directionDeg * Math.PI) / 180;
  const x = Math.sin(turn);
  const y = -Math.cos(turn);
  return {
    across: round((x * eye.rx + y * eye.ry) * cellsPerSecond),
    toward: round(-(x * eye.hx + y * eye.hy) * cellsPerSecond),
  };
}

/** How many cells a second water flowing this fast carries what floats on it; nothing for still water. */
export function flowCellsPerSecond(speed: number): number {
  if (!(speed > 0)) return 0;
  return SLOWEST_CELLS_PER_SECOND + (FASTEST_CELLS_PER_SECOND - SLOWEST_CELLS_PER_SECOND) * Math.min(speed, 1);
}

/**
 * A pattern carried along by flowing water, laid over one sheet of water.
 *
 * The pattern is turned to run the way the water flows and slid along that way by one repeat,
 * over and over, which never shows a jump whatever the direction. To meet the same pattern on
 * the sheet beside it, it is laid as though from the corner of the table, turned: the layer is a
 * square about the middle of the sheet, large enough to cover the sheet however it is turned and
 * slid, and the pattern is set within it so that the repeats fall where they fall on every sheet.
 */
export interface FlowLayer {
  /** Where the layer's square stands within the sheet's box, and how large it is, in pixels. */
  readonly left: number;
  readonly top: number;
  readonly size: number;
  /** Where the pattern is set within the square, as a CSS position. */
  readonly position: string;
  /** How long one repeat takes to go by, in seconds. */
  readonly seconds: number;
}

/**
 * How a pattern of `tilePx` repeats is laid over a sheet of water flowing `directionDeg` at
 * `cellsPerSecond`, the sheet's box given in table pixels.
 */
export function flowLayerOf(
  sheet: { left: number; top: number; width: number; height: number },
  tilePx: number,
  directionDeg: number,
  cellsPerSecond: number,
  gridSize: number
): FlowLayer {
  const size = Math.ceil(Math.hypot(sheet.width, sheet.height) + tilePx * 2);
  const centreX = sheet.left + sheet.width / 2;
  const centreY = sheet.top + sheet.height / 2;
  // The pattern runs along the layer's own x, so the layer is turned from the table's x to the flow.
  const turn = ((directionDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // The middle of the sheet, in the table turned with the layer.
  const u = centreX * cos + centreY * sin;
  const v = -centreX * sin + centreY * cos;
  const along = (offset: number) => round(((-(offset - size / 2) % tilePx) + tilePx) % tilePx);
  const speed = cellsPerSecond * gridSize;
  return {
    left: round(sheet.width / 2 - size / 2),
    top: round(sheet.height / 2 - size / 2),
    size,
    position: `${along(u)}px ${along(v)}px`,
    seconds: speed > 0 ? round(tilePx / speed) : 0,
  };
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}
