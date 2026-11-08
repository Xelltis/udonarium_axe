export const FIRST_PERSON_UNIT_PX = 256;
export const MAX_PIECE_TEXT_SCREEN_PX = 28;
/** How far up from the bottom of the view a lifted piece's feet are held, as a share of half the view's height. */
export const PIECE_FOOT_MARGIN = 0.08;
const BILLBOARD_TEXT_PX = 24;
const CHROME_PAD_PX = 8;
const CHROME_BADGE_ROW_PX = 54;
const CHROME_GAUGE_ROW_PX = 24;
const CHROME_LABEL_ROW_PX = 46;
const MAX_SHADE = 0.85;
/** Where each colour of the night sky stands down a level view, as a share of its height. */
const NIGHT_SKY_STOPS: readonly (readonly [string, number])[] = [
  ['#04060b', 0],
  ['#0b1220', 0.32],
  ['#1c2840', 0.49],
  ['#222f47', 0.5],
  ['#10161f', 0.56],
  ['#06080c', 1],
];

/** The sky over a table that has no picture to show, darkest overhead and palest at the horizon. */
export const NIGHT_SKY = `linear-gradient(to bottom, ${NIGHT_SKY_STOPS.map(([colour, at]) => `${colour} ${round(at * 100)}%`).join(', ')})`;

export type QuadStyle = Record<string, string>;

/**
 * The night sky with its horizon moved down the view by `liftPx` (up, where negative), as it moves
 * when the eye looks up or down: the haze keeps to the horizon, and overhead and underfoot stay dark.
 */
export function nightSkyAt(liftPx: number, viewHeightPx: number): string {
  if (liftPx === 0 || viewHeightPx <= 0) return NIGHT_SKY;
  return skyAt(NIGHT_SKY_STOPS, liftPx, viewHeightPx);
}

/**
 * What is seen past the end of the view from under water: the depths all round, paling upward
 * to where the light comes down through the surface and darkening below, moved down the view by
 * `liftPx` as the eye looks up just as the night sky is. Murky water hides the light above and
 * the dark below alike, until water nothing can be seen through is its own colour all round.
 */
export function waterSkyAt(deepColor: string, liftPx: number, viewHeightPx: number, murk = 0): string {
  const clear = 1 - Math.min(Math.max(Number.isFinite(murk) ? murk : 0, 0), 1);
  const toward = (share: number) => `${round(100 - share * clear)}%`;
  const stops: (readonly [string, number])[] = [
    [`color-mix(in srgb, ${deepColor} ${toward(45)}, #b8e8ff)`, 0],
    [`color-mix(in srgb, ${deepColor} ${toward(20)}, #b8e8ff)`, 0.3],
    [deepColor, 0.5],
    [`color-mix(in srgb, ${deepColor} ${toward(45)}, #000)`, 1],
  ];
  if (viewHeightPx <= 0)
    return `linear-gradient(to bottom, ${stops.map(([colour, at]) => `${colour} ${round(at * 100)}%`).join(', ')})`;
  return skyAt(stops, liftPx, viewHeightPx);
}

function skyAt(stops: readonly (readonly [string, number])[], liftPx: number, viewHeightPx: number): string {
  const placed = stops.map(([colour, at], index) => {
    const edge = index === 0 || index === stops.length - 1;
    return `${colour} ${px(edge ? at * viewHeightPx : at * viewHeightPx + liftPx)}`;
  });
  return `linear-gradient(to bottom, ${placed.join(', ')})`;
}

export function scaleOf(gridSize: number): number {
  return gridSize > 0 ? FIRST_PERSON_UNIT_PX / gridSize : 1;
}

export function perspectivePx(widthPx: number, fovDeg: number): number {
  const half = (Math.min(Math.max(fovDeg, 1), 179) * Math.PI) / 360;
  return Math.max(1, widthPx) / 2 / Math.tan(half);
}

/**
 * How far off, for a view drawn on a canvas that fades into the dark with distance, things have faded
 * wholly away: the shade grows as it does for the CSS view, to its most at the farthest drawn.
 */
export function fadeOutPx(depthPx: number): number {
  return depthPx / MAX_SHADE;
}

export function shadeFor(depth: number, depthPx: number): number {
  if (depthPx <= 0) return 0;
  return round(Math.min(Math.max(depth / depthPx, 0), 1) * MAX_SHADE);
}

export function billboardStyle(
  point: { x: number; y: number; z: number },
  widthPx: number,
  heightPx: number,
  yaw: number,
  scale: number
): QuadStyle {
  return {
    width: px(widthPx * scale),
    height: px(heightPx * scale),
    transformOrigin: '0 0',
    transform: `translate3d(${px(point.x * scale)}, ${px(point.y * scale)}, ${px(point.z * scale)}) rotateZ(${deg(yaw)}) rotateX(-90deg) translate(-50%, -100%)`,
  };
}

/**
 * The clip path that cuts a board standing from `basePx` and `heightPx` tall to the band of it a
 * tipped camera keeps, from `kept.lowPx` to `kept.highPx`, or null where all of it is kept. The
 * sides, and the end nothing cuts, are left open well past the board, so what is told above it and
 * the ring at its feet still show.
 */
export function billboardCutPath(
  kept: { lowPx: number; highPx: number },
  basePx: number,
  heightPx: number
): string | null {
  const topPx = basePx + heightPx;
  if (heightPx <= 0 || (kept.lowPx <= basePx && kept.highPx >= topPx)) return null;
  const top = kept.highPx < topPx ? `${round(((topPx - kept.highPx) / heightPx) * 100)}%` : '-400%';
  const bottom = kept.lowPx > basePx ? `${round(((kept.lowPx - basePx) / heightPx) * 100)}%` : '-100%';
  return `inset(${top} -100% ${bottom} -100%)`;
}

/** A board's style cut as {@link billboardCutPath} cuts it. */
export function withBillboardCut(
  style: QuadStyle,
  kept: { lowPx: number; highPx: number },
  basePx: number,
  heightPx: number
): QuadStyle {
  const clipPath = billboardCutPath(kept, basePx, heightPx);
  return clipPath ? { ...style, clipPath } : style;
}

export function projectedScaleOf(depthPx: number, scale: number, perspective: number): number {
  return perspective / Math.max(depthPx * scale, 1);
}

/**
 * How far a piece standing close has to be raised, in table pixels, for its feet to come up into
 * the view rather than below its bottom edge; nothing for a piece far enough off to show whole.
 * Raised, it floats a little off the floor, which is the price of seeing where it stands.
 *
 * `depthPx` is how far ahead the piece stands along the way the camera faces, and `pitchDeg` how far
 * the camera tips. Looking down brings the feet into the view and the lift goes; looking up keeps
 * the lift a level view gives, so a piece does not climb the view as the eye looks up at it.
 */
export function billboardLiftPx(
  baseZ: number,
  eyeZ: number,
  depthPx: number,
  perspective: number,
  viewHeightPx: number,
  pitchDeg = 0
): number {
  if (viewHeightPx <= 0 || depthPx <= 0 || perspective <= 0) return 0;
  const bottom = Math.atan(((viewHeightPx / 2) * (1 - PIECE_FOOT_MARGIN)) / perspective);
  const angle = (Math.min(pitchDeg, 0) * Math.PI) / 180 - bottom;
  if (angle <= -Math.PI / 2) return 0;
  return Math.max(0, eyeZ + depthPx * Math.tan(angle) - baseZ);
}

/**
 * How far the writing over a piece is shrunk so that it reads no larger than it should on the
 * screen, however near the piece stands; 1 for a piece far enough off. The piece itself is drawn
 * at the size the eye sees it, growing as it comes near.
 */
export function billboardTextScale(depthPx: number, scale: number, perspective: number): number {
  const projected = BILLBOARD_TEXT_PX * projectedScaleOf(depthPx, scale, perspective);
  const fits = projected > 0 ? MAX_PIECE_TEXT_SCREEN_PX / projected : 1;
  return Math.min(fits, 1);
}

/** The rows of what is told about a piece: its marks, how many readings, and its name or pick. */
export interface PieceChromeRows {
  readonly badges: boolean;
  readonly gauges: number;
  readonly label: boolean;
}

/** How tall what is told about a piece stands, in the box's own pixels before it is scaled. */
export function pieceChromeHeightPx(rows: PieceChromeRows): number {
  return (
    CHROME_PAD_PX +
    (rows.badges ? CHROME_BADGE_ROW_PX : 0) +
    rows.gauges * CHROME_GAUGE_ROW_PX +
    (rows.label ? CHROME_LABEL_ROW_PX : 0)
  );
}

/**
 * Where what is told about a piece stands in its box, in percent from the bottom: just above the
 * top of the picture, which fills the box, unless that would carry it off the top of the view, when
 * it comes down to stay in sight, over the picture if it must. `chromeScreenPx` is how tall it shows on the screen,
 * and `marginPx` how far below the top of the view it keeps. `depthPx` is how far ahead the piece
 * stands along the way the camera faces, and `pitchDeg` how far the camera tips up, which lifts the
 * top of the view.
 */
export function pieceChromeBottomPercent(at: {
  heightPx: number;
  baseZ: number;
  eyeZ: number;
  depthPx: number;
  pitchDeg?: number;
  perspective: number;
  viewHeightPx: number;
  chromeScreenPx: number;
  marginPx: number;
}): number {
  if (at.viewHeightPx <= 0 || at.depthPx <= 0 || at.perspective <= 0 || at.heightPx <= 0) return 100;
  const topZ = at.baseZ + at.heightPx;
  const roomPx = at.viewHeightPx / 2 - at.marginPx - at.chromeScreenPx;
  const angle = ((at.pitchDeg ?? 0) * Math.PI) / 180 + Math.atan(roomPx / at.perspective);
  const highestZ = angle >= Math.PI / 2 ? Infinity : at.eyeZ + at.depthPx * Math.tan(angle);
  const percent = ((Math.min(topZ, highestZ) - at.baseZ) / at.heightPx) * 100;
  return round(Math.min(Math.max(percent, 0), 100));
}

export function billboardHudTransform(textScale: number): string | null {
  return textScale >= 1 ? null : `scale(${round(textScale)})`;
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function px(value: number): string {
  return `${round(value)}px`;
}

function deg(value: number): string {
  return `${round(value)}deg`;
}
