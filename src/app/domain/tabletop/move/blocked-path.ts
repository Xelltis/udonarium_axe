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
 */
export function clearRunAlong(from: MovePoint, to: MovePoint, blocks: readonly MoveBlock[]): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 1;

  let run = 1;
  for (const block of blocks) {
    const entered = entryAlong(from, dx, dy, block);
    if (entered !== null && entered < run) run = entered;
  }
  return run;
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
  if (enters <= 0) return null;
  return enters;
}

function slabAlong(at: number, step: number, low: number, high: number): { enters: number; leaves: number } | null {
  if (step === 0) return at < low || at > high ? null : { enters: -Infinity, leaves: Infinity };
  const one = (low - at) / step;
  const other = (high - at) / step;
  return { enters: Math.min(one, other), leaves: Math.max(one, other) };
}
