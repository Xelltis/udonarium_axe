import { GridType } from '@axe/domain/tabletop/game-table';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

/**
 * The one direction a slope could run before a block could slope to more than one side.
 *
 * A room saved then holds it, and a peer running an older build still reads it, so it is kept
 * as the way in and the way out rather than as how a slope is held now.
 */
export enum SlopeDirection {
  NONE = 0,
  TOP = 1,
  BOTTOM = 2,
  LEFT = 3,
  RIGHT = 4,
}

/**
 * A side of a block's top that its slope runs down to, named by the way that side faces.
 *
 * A square block has four of them and a hex block six, and the six a hex block has depend on
 * which way its cells are turned. The names are shared, so a block keeps what it was given
 * when a table's grid changes under it, and anything the new grid has no side for is read as
 * the side it points nearest to.
 */
export type SlopeSide = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/** The sides of a square block, clockwise from the top of the screen. */
export const SQUARE_SLOPE_SIDES: readonly SlopeSide[] = ['n', 'e', 's', 'w'];

/** The sides of a hex block whose cells have a flat top, clockwise from the top of the screen. */
export const FLAT_TOP_SLOPE_SIDES: readonly SlopeSide[] = ['n', 'ne', 'se', 's', 'sw', 'nw'];

/** The sides of a hex block whose cells have a pointed top, clockwise from the top of the screen. */
export const POINTY_TOP_SLOPE_SIDES: readonly SlopeSide[] = ['ne', 'e', 'se', 'sw', 'w', 'nw'];

/** The shape of the block a grid gives, which decides how many sides it has and where they face. */
export type SlopeGridKind = 'square' | 'flatTop' | 'pointyTop';

const TURN = Math.PI / 180;

/**
 * Which way each side faces on each kind of grid, in radians clockwise from the top of the
 * screen.
 *
 * A square block's sides face the four quarters. A hex block's six face a sixth of the way
 * round apart, which is not quite where their names point: the north-east side of a block of
 * flat-topped cells faces 60° round rather than 45°. The names are the ones a reader knows,
 * and the angles are the ones the block is actually built to.
 */
const GRID_AZIMUTH: Record<SlopeGridKind, Partial<Record<SlopeSide, number>>> = {
  square: { n: 0, e: 90 * TURN, s: 180 * TURN, w: 270 * TURN },
  flatTop: { n: 0, ne: 60 * TURN, se: 120 * TURN, s: 180 * TURN, sw: 240 * TURN, nw: 300 * TURN },
  pointyTop: { ne: 30 * TURN, e: 90 * TURN, se: 150 * TURN, sw: 210 * TURN, w: 270 * TURN, nw: 330 * TURN },
};

/** Where each name points, for reading one grid's sides as another's. */
const SIDE_AZIMUTH: Record<SlopeSide, number> = {
  n: 0,
  ne: Math.PI / 4,
  e: Math.PI / 2,
  se: (3 * Math.PI) / 4,
  s: Math.PI,
  sw: (5 * Math.PI) / 4,
  w: (3 * Math.PI) / 2,
  nw: (7 * Math.PI) / 4,
};

/** The side each direction an older room holds runs down to. */
const LEGACY_SIDE: Record<number, SlopeSide> = {
  [SlopeDirection.TOP]: 'n',
  [SlopeDirection.BOTTOM]: 's',
  [SlopeDirection.LEFT]: 'w',
  [SlopeDirection.RIGHT]: 'e',
};

const SIDE_LEGACY: Partial<Record<SlopeSide, SlopeDirection>> = {
  n: SlopeDirection.TOP,
  s: SlopeDirection.BOTTOM,
  w: SlopeDirection.LEFT,
  e: SlopeDirection.RIGHT,
};

const ALL_SIDES: readonly SlopeSide[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** The sides a block has on this kind of grid, clockwise from the top of the screen. */
export function slopeSidesOfGrid(kind: SlopeGridKind): readonly SlopeSide[] {
  if (kind === 'flatTop') return FLAT_TOP_SLOPE_SIDES;
  if (kind === 'pointyTop') return POINTY_TOP_SLOPE_SIDES;
  return SQUARE_SLOPE_SIDES;
}

/** The shape a grid gives a block: a rectangle on a square board, a hexagon on a hex one. */
export function gridSlopeKind(gridType: GridType): SlopeGridKind {
  if (!isHexGrid(gridType)) return 'square';
  return isFlatTopGrid(gridType) ? 'flatTop' : 'pointyTop';
}

/** The sides a block on this grid has: four on a square board, six on a hex one. */
export function gridSlopeSides(gridType: GridType): readonly SlopeSide[] {
  return slopeSidesOfGrid(gridSlopeKind(gridType));
}

/** Which way a side of a block on this kind of grid faces, in radians clockwise from the top. */
export function slopeSideAzimuth(side: SlopeSide, kind: SlopeGridKind = 'square'): number {
  return GRID_AZIMUTH[kind][side] ?? SIDE_AZIMUTH[side];
}

/** The same as a unit vector in screen pixels, where y runs down the screen. */
export function slopeSideNormal(side: SlopeSide, kind: SlopeGridKind = 'square'): { x: number; y: number } {
  const azimuth = slopeSideAzimuth(side, kind);
  return { x: Math.sin(azimuth), y: -Math.cos(azimuth) };
}

/**
 * The sides a block slopes to, read from what it holds.
 *
 * A room saved before a block could slope to more than one side holds only the old single
 * direction, and is read as that one side. Text that names nothing a block has is read as no
 * slope at all, so a damaged save leaves a flat block rather than a broken one.
 */
export function parseSlopeSides(held: unknown, legacy?: unknown): SlopeSide[] {
  const text = `${held ?? ''}`.trim();
  if (text.length > 0) {
    const seen = new Set<SlopeSide>();
    for (const part of text.split(/[\s,]+/)) {
      const name = part.trim().toLowerCase();
      if (isSlopeSide(name)) seen.add(name);
    }
    if (seen.size > 0) return ALL_SIDES.filter((side) => seen.has(side));
  }
  const direction = Number(legacy ?? SlopeDirection.NONE);
  const side = LEGACY_SIDE[direction];
  return side ? [side] : [];
}

/** Writes the sides the way {@link parseSlopeSides} reads them. */
export function encodeSlopeSides(sides: readonly SlopeSide[]): string {
  const seen = new Set(sides.filter(isSlopeSide));
  return ALL_SIDES.filter((side) => seen.has(side)).join(',');
}

/**
 * The single direction an older peer is told about.
 *
 * It only knows the four sides of a square and only one of them at a time, so it is given the
 * first side that is one of its four, and a block sloping to none of them is left flat rather
 * than tipped a way it does not slope.
 */
export function legacySlopeDirection(sides: readonly SlopeSide[]): SlopeDirection {
  for (const side of sides) {
    const direction = SIDE_LEGACY[side];
    if (direction !== undefined) return direction;
  }
  return SlopeDirection.NONE;
}

/**
 * The sides of this grid a block slopes to.
 *
 * A side the grid does not have, which is what a block carries after the table's grid changed
 * under it, is taken as the side of this grid it points nearest to.
 */
export function slopeSidesOn(sides: readonly SlopeSide[], available: readonly SlopeSide[]): SlopeSide[] {
  const kept = new Set<SlopeSide>();
  for (const side of sides) {
    kept.add(available.includes(side) ? side : nearestSide(side, available));
  }
  return available.filter((side) => kept.has(side));
}

/**
 * The sides a block is drawn sloping to on a grid.
 *
 * A block whose slope is on but which names no side it still has runs down to the south, the
 * way a slope with no direction has always been drawn.
 */
export function drawnSlopeSides(
  block: { isSlope: boolean; slopeSides: readonly SlopeSide[] },
  available: readonly SlopeSide[]
): SlopeSide[] {
  if (!block.isSlope) return [];
  const sides = slopeSidesOn(block.slopeSides, available);
  return sides.length > 0 ? sides : slopeSidesOn(['s'], available);
}

function nearestSide(side: SlopeSide, available: readonly SlopeSide[]): SlopeSide {
  let nearest = available[0];
  let smallest = Infinity;
  for (const candidate of available) {
    const turn = SIDE_AZIMUTH[candidate] - SIDE_AZIMUTH[side];
    const apart = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
    // Two sides can sit the same way off, and which is taken should not turn on a rounding.
    if (apart < smallest - 1e-9) {
      smallest = apart;
      nearest = candidate;
    }
  }
  return nearest;
}

function isSlopeSide(name: string): name is SlopeSide {
  return (ALL_SIDES as readonly string[]).includes(name);
}
