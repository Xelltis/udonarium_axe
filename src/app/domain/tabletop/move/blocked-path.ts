export interface MovePoint {
  x: number;
  y: number;
}

import { unturnedPoint } from '@axe/domain/tabletop/terrain-box';

/** The ground a piece may not walk onto, squared up to the table unless it is turned. */
export interface MoveBlock {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /**
   * How far the block is turned about its middle, in degrees, as a turned terrain is.
   *
   * The sides above are then the ones it had before the turn.
   */
  rotate?: number;
}

/**
 * A turned block, grown on every side by how far a piece hangs over its own middle.
 *
 * The overhang is measured square to the table. Laid along the block's own sides, each side
 * takes as much of it as points that way, which keeps the piece at least that far off the block
 * at any turn, and exactly that far at a quarter turn.
 */
export function turnedMoveBlock(box: MoveBlock, rotateDeg: number, spreadX: number, spreadY: number): MoveBlock {
  const turn = (rotateDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(turn));
  const sin = Math.abs(Math.sin(turn));
  const alongWidth = spreadX * cos + spreadY * sin;
  const alongDepth = spreadX * sin + spreadY * cos;
  return {
    minX: box.minX - alongWidth,
    minY: box.minY - alongDepth,
    maxX: box.maxX + alongWidth,
    maxY: box.maxY + alongDepth,
    rotate: rotateDeg,
  };
}

/**
 * How far along the way from one point to another a piece gets before something stops it.
 *
 * Answers a fraction of the way: 1 where the way is clear, 0 where it is stopped where it
 * stands. A piece already standing inside a block is let out rather than held there, so
 * terrain laid down over one does not pin it.
 *
 * `gapPx` is how far short of the face to stop. A piece is put down on whole pixels, and the
 * rounding runs one way, so a piece stopped flush against the far face of a block lands a
 * hair inside it -- and a hair inside reads as standing in it, which is a way through. The
 * gap is what keeps the answer on the outside of that rounding.
 */
export function clearRunAlong(from: MovePoint, to: MovePoint, blocks: readonly MoveBlock[], gapPx: number = 0): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 1;

  let run = 1;
  for (const block of blocks) {
    const entered = entryAlong(from, dx, dy, block);
    if (entered !== null && entered < run) run = entered;
  }
  if (run >= 1) return 1;
  return Math.max(0, run - gapPx / Math.hypot(dx, dy));
}

/**
 * Where the way first crosses into a block, or nothing when it never does.
 *
 * A turned block is met by turning the way back with it: turned about the block's middle, the
 * way keeps its length, so how far along it the block is entered does not change.
 */
function entryAlong(from: MovePoint, dx: number, dy: number, block: MoveBlock): number | null {
  if (block.rotate) {
    const middleX = (block.minX + block.maxX) / 2;
    const middleY = (block.minY + block.maxY) / 2;
    const start = unturnedPoint(middleX, middleY, block.rotate, from.x, from.y);
    const end = unturnedPoint(middleX, middleY, block.rotate, from.x + dx, from.y + dy);
    return entryAlongSquare(start, end.x - start.x, end.y - start.y, block);
  }
  return entryAlongSquare(from, dx, dy, block);
}

function entryAlongSquare(from: MovePoint, dx: number, dy: number, block: MoveBlock): number | null {
  const across = slabAlong(from.x, dx, block.minX, block.maxX);
  if (across === null) return null;
  const along = slabAlong(from.y, dy, block.minY, block.maxY);
  if (along === null) return null;

  const enters = Math.max(across.enters, along.enters);
  const leaves = Math.min(across.leaves, along.leaves);
  if (enters > leaves || leaves <= 0 || enters >= 1) return null;
  // Standing in it at the outset: on its way out, not on its way in.
  if (isWithin(from, block)) return null;
  return Math.max(0, enters);
}

/** Within a block, rather than resting against a face of it. */
function isWithin(point: MovePoint, block: MoveBlock): boolean {
  return point.x > block.minX && point.x < block.maxX && point.y > block.minY && point.y < block.maxY;
}

function slabAlong(at: number, step: number, low: number, high: number): { enters: number; leaves: number } | null {
  if (step === 0) return at < low || at > high ? null : { enters: -Infinity, leaves: Infinity };
  const one = (low - at) / step;
  const other = (high - at) / step;
  return { enters: Math.min(one, other), leaves: Math.max(one, other) };
}
