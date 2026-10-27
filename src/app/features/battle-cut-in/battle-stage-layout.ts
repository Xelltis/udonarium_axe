import { BattleSide } from '@axe/domain/battle/battle-lineup';
import { Point3 } from '@axe/domain/effect/effect-timeline';
import { ViewRotation } from '@axe/domain/effect/effect-view';

/** The size of a cell on the stage's floor, which is what the effects are drawn against, as on the table. */
export const BATTLE_CELL_PX = 50;
/** How the floor is tilted away: straight across, so the two sides face each other across the screen. */
export const BATTLE_VIEW: ViewRotation = { x: 64, y: 0, z: 0 };
/** How tall a fighter stands on the floor. */
export const BATTLE_FIGURE_PX = 110;
/** How high off the floor an effect plays, so that it lands on the body rather than at the feet. */
export const BATTLE_EFFECT_RISE_PX = 46;
/** How far each side stands from the middle, in cells. */
const SPREAD_CELLS = 3.2;
/** How far each side stands from the middle on a band taller than it is wide, in cells. */
const NARROW_SPREAD_CELLS = 2.2;
/**
 * Where those struck stand behind the first of them, in cells: further from the middle, and
 * staggered back and forth, far enough apart that four of them are all seen.
 */
const DEFENDER_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1.7, -1.4],
  [1.5, 1.4],
  [3.2, 0],
];
/** How far past the outermost fighter the stage keeps room for its picture, in cells. */
const PICTURE_ROOM_CELLS = 1.4;
/** How far off the stage the sides start before stepping in. */
const ENTRY_DISTANCE_PX = 9 * BATTLE_CELL_PX;

/** Which way along the floor a side lies from the middle: left is less, right is more. */
function signOf(side: BattleSide): number {
  return side === 'left' ? -1 : 1;
}

/**
 * How far each side stands from the middle, in cells: closer on a band taller than it is wide, so
 * that on a phone held upright the fighters are drawn large enough to make out.
 */
export function stageSpread(width: number, height: number): number {
  return width > 0 && width < height ? NARROW_SPREAD_CELLS : SPREAD_CELLS;
}

/** Where the one striking stands, the given number of cells from the middle. */
export function attackerPoint(side: BattleSide, spread = SPREAD_CELLS): Point3 {
  return { x: signOf(side) * spread * BATTLE_CELL_PX, y: 0, z: 0 };
}

/** Where those struck stand, on the side across from the one striking. */
export function defenderPoints(attackerSide: BattleSide, count: number, spread = SPREAD_CELLS): Point3[] {
  const sign = -signOf(attackerSide);
  return DEFENDER_OFFSETS.slice(0, Math.max(0, count)).map(([across, back]) => ({
    x: sign * (spread + across) * BATTLE_CELL_PX,
    y: back * BATTLE_CELL_PX,
    z: 0,
  }));
}

/**
 * How large the stage is drawn in a band of this size: the fighters about a third of its height,
 * and both sides inside its width however many are struck, which spreads them wider.
 */
export function stageScale(width: number, height: number, defenders: number): number {
  if (width <= 0 || height <= 0) return 1;
  const used = DEFENDER_OFFSETS.slice(0, Math.max(1, defenders));
  const farthest = Math.max(...used.map(([across]) => across));
  const span = 2 * (stageSpread(width, height) + farthest + PICTURE_ROOM_CELLS) * BATTLE_CELL_PX;
  return Math.max(0.3, Math.min((height * 0.36) / BATTLE_FIGURE_PX, (width * 0.94) / span));
}

/**
 * How high the band stands on a screen of this height: most of it, so that a stage's picture,
 * painted wider than it is high, keeps its sky as well as the ground the fighters stand on.
 */
export function bandHeight(viewportHeight: number): number {
  return Math.round(Math.max(240, viewportHeight * 0.84));
}

/**
 * How far a fighter of this side stands from where it belongs, along the floor: off the stage
 * before stepping in, and a step towards the middle for the one striking.
 */
export function fighterShift(side: BattleSide, entry: number, step: number): number {
  const sign = signOf(side);
  return sign * (1 - entry) * ENTRY_DISTANCE_PX - sign * step * BATTLE_CELL_PX;
}

/**
 * Stands something upright at a point of the floor, facing the screen, the middle of its foot on
 * the point and grown about it. Drawn from its top left corner, as the effects are.
 */
export function standingTransform(point: Point3, shiftX: number, lift: number, scale = 1): string {
  const grown = scale === 1 ? '' : ` scale(${scale.toFixed(3)})`;
  return (
    `translate3d(${(point.x + shiftX).toFixed(2)}px, ${point.y.toFixed(2)}px, ${(point.z + lift).toFixed(2)}px)` +
    ` rotateX(${-BATTLE_VIEW.x}deg)${grown} translate(-50%, -100%)`
  );
}

/** Lays something flat on the floor, centred on a point. */
export function lyingTransform(point: Point3, shiftX: number): string {
  return `translate3d(${(point.x + shiftX).toFixed(2)}px, ${point.y.toFixed(2)}px, 0px) translate(-50%, -50%)`;
}
