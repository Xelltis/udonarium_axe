export interface MovePoint {
  x: number;
  y: number;
}

/** The ground a piece may not walk onto, squared up to the table. */
export interface MoveBlock {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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

/** Where the way first crosses into a block, or nothing when it never does. */
function entryAlong(from: MovePoint, dx: number, dy: number, block: MoveBlock): number | null {
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
