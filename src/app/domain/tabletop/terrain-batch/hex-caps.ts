import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { hexCellCenter, hexCornerOffsets, hexLayoutOf } from '@axe/domain/tabletop/hex-geometry';

/** A block on a hex board, as the tops drawn together see it. */
export interface HexBlock {
  readonly identifier: string;
  /** The cells it covers, by column and row; the first is the one at its middle. */
  readonly cells: readonly (readonly [number, number])[];
  /** How high its top stands, in pixels. */
  readonly topPx: number;
  /** What its top is drawn with; tops drawn with different pictures are never on one sheet. */
  readonly look: string;
}

/** One block's top on a sheet: its cells, cut as one path from the corner of the sheet's box. */
export interface HexCapBlock {
  readonly identifier: string;
  readonly path: string;
  /**
   * The edges the block shares with tops of the same height on other sheets, as open lines. Drawn
   * across the join, just outside the sheet, they cover the hairline two sheets leave where they meet.
   */
  readonly seams: string;
}

/**
 * The tops of blocks of one height and one picture in one chunk of a hex board, drawn on one sheet.
 *
 * Its box is given in table pixels and grown on every side by {@link HEX_CAP_BLEED}; every path is
 * measured from the box's corner.
 */
export interface HexCapSheet {
  readonly key: string;
  readonly topPx: number;
  readonly look: string;
  /** A block whose top the sheet wears, which is the top of every block on it. */
  readonly wearer: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Every cell on the sheet as one path, laid under the blocks so no hairline between them shows the floor. */
  readonly outline: string;
  readonly blocks: readonly HexCapBlock[];
}

/** How far a sheet's box reaches past its outermost corner, which is what a join drawn just outside it needs. */
export const HEX_CAP_BLEED = 1;

/** How many columns and rows of cells the tops are gathered into sheets over. */
export const HEX_CHUNK_CELLS = 8;

function number(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}

/**
 * Gathers the tops of blocks on a hex board onto sheets.
 *
 * The board is cut into chunks {@link HEX_CHUNK_CELLS} columns and rows a side, and each block goes
 * on the sheet for its middle cell's chunk, its height and its picture. A sheet is one surface for
 * the browser to keep however many blocks it holds.
 *
 * Each block stays a path of its own, so its picture can still start from the corner of its own
 * outline the way a block drawn alone does, and it can be lit and picked out on its own.
 */
export function hexCapSheetsOf(blocks: readonly HexBlock[], gridSize: number, isFlatTop: boolean): HexCapSheet[] {
  const layout = hexLayoutOf(gridSize, isFlatTop);
  const corners = hexCornerOffsets(layout.circumradius, isFlatTop);
  const centreOf = (col: number, row: number) =>
    hexCellCenter(col, row, layout.colSpacing, layout.rowSpacing, isFlatTop);

  const sheetKeyOf = (block: HexBlock): string => {
    const [col, row] = block.cells[0];
    return `${Math.floor(col / HEX_CHUNK_CELLS)},${Math.floor(row / HEX_CHUNK_CELLS)}:${block.topPx}:${block.look}`;
  };
  const cellOwner = new Map<string, { block: HexBlock; sheet: string }>();
  const bySheet = new Map<string, HexBlock[]>();
  for (const block of blocks) {
    const sheet = sheetKeyOf(block);
    for (const [col, row] of block.cells) cellOwner.set(`${col},${row}`, { block, sheet });
    const held = bySheet.get(sheet);
    if (held) held.push(block);
    else bySheet.set(sheet, [block]);
  }

  const sheets: HexCapSheet[] = [];
  for (const [key, members] of bySheet) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const block of members) {
      for (const [col, row] of block.cells) {
        const centre = centreOf(col, row);
        for (const corner of corners) {
          minX = Math.min(minX, centre.x + corner.x);
          minY = Math.min(minY, centre.y + corner.y);
          maxX = Math.max(maxX, centre.x + corner.x);
          maxY = Math.max(maxY, centre.y + corner.y);
        }
      }
    }
    const left = minX - HEX_CAP_BLEED;
    const top = minY - HEX_CAP_BLEED;
    const point = (x: number, y: number) => `${number(x - left)} ${number(y - top)}`;

    const blockPaths: HexCapBlock[] = members.map((block) => {
      const seams: string[] = [];
      const subpaths = block.cells.map(([col, row]) => {
        const centre = centreOf(col, row);
        const sides = hexSideStepsAt(isFlatTop, col, row);
        for (let side = 0; side < 6; side++) {
          const [dx, dy] = sides[side];
          const neighbour = cellOwner.get(`${col + dx},${row + dy}`);
          if (!neighbour || neighbour.sheet === key || neighbour.block.topPx !== block.topPx) continue;
          const from = corners[side];
          const to = corners[(side + 1) % 6];
          seams.push(`M${point(centre.x + from.x, centre.y + from.y)}L${point(centre.x + to.x, centre.y + to.y)}`);
        }
        return `M${corners.map((corner) => point(centre.x + corner.x, centre.y + corner.y)).join('L')}Z`;
      });
      return { identifier: block.identifier, path: subpaths.join(''), seams: seams.join('') };
    });

    sheets.push({
      key,
      topPx: members[0].topPx,
      look: members[0].look,
      wearer: members[0].identifier,
      left,
      top,
      width: maxX - minX + 2 * HEX_CAP_BLEED,
      height: maxY - minY + 2 * HEX_CAP_BLEED,
      outline: blockPaths.map((block) => block.path).join(''),
      blocks: blockPaths,
    });
  }
  return sheets;
}
