/** A block on a square board, as the tops drawn together see it. */
export interface SquareBlock {
  readonly identifier: string;
  /** The column and row of its north-west cell. */
  readonly col: number;
  readonly row: number;
  /** How many cells it covers across and down. */
  readonly cols: number;
  readonly rows: number;
  /** How high its top stands, in pixels. */
  readonly topPx: number;
  /** What its top is drawn with; tops drawn with different pictures are never one piece. */
  readonly look: string;
}

/** The block a cell of a cap belongs to, and which of the block's own cells it is, row by row. */
export interface CapCell {
  readonly identifier: string;
  readonly index: number;
  /** How many cells across the block is, which says whether it goes on past either side of the cell. */
  readonly cols: number;
}

/**
 * The tops of neighbouring blocks of one height and one picture, drawn as one piece.
 *
 * Its box is given in table pixels, and grown on every side by {@link CAP_BLEED} so the cut can
 * reach over the join with a piece next to it. The cut and every position within the cap are
 * measured from the box's own corner.
 */
export interface SquareCap {
  readonly key: string;
  readonly topPx: number;
  readonly look: string;
  /** A block whose top the cap wears, which is the top of every block in it. */
  readonly wearer: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The cells the box spans across and down, not counting the bleed. */
  readonly cols: number;
  readonly rows: number;
  /** The cut to the cap's own cells, as the `d` of a path. */
  readonly path: string;
  /** Who each cell of the box belongs to, row by row; null for a cell outside the cap. */
  readonly cells: readonly (CapCell | null)[];
}

/** How far a cap reaches over a join with another piece of the same height, in pixels. */
export const CAP_BLEED = 1;

/** How many cells across and down the tops are gathered into pieces over. */
export const CAP_CHUNK_CELLS = 8;

interface Placed {
  readonly block: SquareBlock;
  readonly index: number;
}

function number(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}

/**
 * Gathers the tops of blocks on a square board into caps.
 *
 * The board is cut into chunks {@link CAP_CHUNK_CELLS} cells a side, and within a chunk the cells
 * of one height and picture that touch along a side are one cap. A cap is one surface for the
 * browser to keep however many blocks it covers, and a chunk keeps a change to one block from
 * redrawing the tops of the whole board.
 *
 * Two surfaces laid edge to edge leave a hairline between them where each only half covers the
 * pixels along the join, and the floor shows through it. So wherever a cap meets another piece of
 * the same height, it reaches {@link CAP_BLEED} over the join.
 *
 * A cell claimed by two blocks is left out of every cap; the caller is to draw such blocks alone.
 */
export function squareCapsOf(blocks: readonly SquareBlock[], gridSize: number): SquareCap[] {
  const at = new Map<string, Placed>();
  const shared = new Set<string>();
  for (const block of blocks) {
    for (let dy = 0; dy < block.rows; dy++) {
      for (let dx = 0; dx < block.cols; dx++) {
        const key = `${block.col + dx},${block.row + dy}`;
        if (at.has(key)) shared.add(key);
        at.set(key, { block, index: dy * block.cols + dx });
      }
    }
  }
  for (const key of shared) at.delete(key);

  const caps: SquareCap[] = [];
  const taken = new Set<string>();
  const cellsInOrder = [...at.keys()].map((key) => key.split(',').map(Number) as [number, number]);
  cellsInOrder.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  for (const [startCol, startRow] of cellsInOrder) {
    const startKey = `${startCol},${startRow}`;
    if (taken.has(startKey)) continue;
    const start = at.get(startKey)!;
    const chunkCol = Math.floor(startCol / CAP_CHUNK_CELLS);
    const chunkRow = Math.floor(startRow / CAP_CHUNK_CELLS);
    const sameCap = (col: number, row: number): boolean => {
      if (Math.floor(col / CAP_CHUNK_CELLS) !== chunkCol || Math.floor(row / CAP_CHUNK_CELLS) !== chunkRow)
        return false;
      const other = at.get(`${col},${row}`);
      return !!other && other.block.topPx === start.block.topPx && other.block.look === start.block.look;
    };

    const region: [number, number][] = [];
    const queue: [number, number][] = [[startCol, startRow]];
    taken.add(startKey);
    while (queue.length > 0) {
      const [col, row] = queue.pop()!;
      region.push([col, row]);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const key = `${col + dx},${row + dy}`;
        if (taken.has(key) || !sameCap(col + dx, row + dy)) continue;
        taken.add(key);
        queue.push([col + dx, row + dy]);
      }
    }

    const inCap = new Set(region.map(([col, row]) => `${col},${row}`));
    const minCol = Math.min(...region.map(([col]) => col));
    const maxCol = Math.max(...region.map(([col]) => col));
    const minRow = Math.min(...region.map(([, row]) => row));
    const maxRow = Math.max(...region.map(([, row]) => row));
    const cols = maxCol - minCol + 1;
    const rows = maxRow - minRow + 1;

    /** Whether the cap reaches over its edge towards this cell: another piece of the same height stands there. */
    const reachesTowards = (col: number, row: number): boolean => {
      if (inCap.has(`${col},${row}`)) return false;
      const other = at.get(`${col},${row}`);
      return !!other && other.block.topPx === start.block.topPx;
    };

    const cells: (CapCell | null)[] = new Array(cols * rows).fill(null);
    const subpaths: string[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      let col = minCol;
      while (col <= maxCol) {
        if (!inCap.has(`${col},${row}`)) {
          col++;
          continue;
        }
        const up = reachesTowards(col, row - 1);
        const down = reachesTowards(col, row + 1);
        let end = col;
        while (
          end + 1 <= maxCol &&
          inCap.has(`${end + 1},${row}`) &&
          reachesTowards(end + 1, row - 1) === up &&
          reachesTowards(end + 1, row + 1) === down
        ) {
          end++;
        }
        for (let c = col; c <= end; c++) {
          const placed = at.get(`${c},${row}`)!;
          cells[(row - minRow) * cols + (c - minCol)] = {
            identifier: placed.block.identifier,
            index: placed.index,
            cols: placed.block.cols,
          };
        }
        const x0 = CAP_BLEED + (col - minCol) * gridSize - (reachesTowards(col - 1, row) ? CAP_BLEED : 0);
        const x1 = CAP_BLEED + (end + 1 - minCol) * gridSize + (reachesTowards(end + 1, row) ? CAP_BLEED : 0);
        const y0 = CAP_BLEED + (row - minRow) * gridSize - (up ? CAP_BLEED : 0);
        const y1 = CAP_BLEED + (row + 1 - minRow) * gridSize + (down ? CAP_BLEED : 0);
        subpaths.push(`M${number(x0)} ${number(y0)}H${number(x1)}V${number(y1)}H${number(x0)}Z`);
        col = end + 1;
      }
    }

    caps.push({
      key: `${chunkCol},${chunkRow}:${startCol},${startRow}`,
      topPx: start.block.topPx,
      look: start.block.look,
      wearer: start.block.identifier,
      left: minCol * gridSize - CAP_BLEED,
      top: minRow * gridSize - CAP_BLEED,
      width: cols * gridSize + 2 * CAP_BLEED,
      height: rows * gridSize + 2 * CAP_BLEED,
      cols,
      rows,
      path: subpaths.join(''),
      cells,
    });
  }
  return caps;
}

/** The block under a point on a cap, measured from the corner of the cap's box; null off its cells. */
export function capCellAt(cap: SquareCap, x: number, y: number, gridSize: number): CapCell | null {
  const col = Math.floor((x - CAP_BLEED) / gridSize);
  const row = Math.floor((y - CAP_BLEED) / gridSize);
  if (col < 0 || row < 0 || col >= cap.cols || row >= cap.rows) return null;
  return cap.cells[row * cap.cols + col];
}
