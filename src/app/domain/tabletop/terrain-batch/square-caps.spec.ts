import { capCellAt, SquareBlock, squareCapsOf } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { describe, expect, it } from 'vitest';

const GRID = 50;

function block(identifier: string, col: number, row: number, extra: Partial<SquareBlock> = {}): SquareBlock {
  return { identifier, col, row, cols: 1, rows: 1, topPx: 100, look: 'stone', ...extra };
}

describe('the tops of blocks on a square board, gathered into caps', () => {
  it('makes one cap of neighbouring tops of one height and picture', () => {
    const caps = squareCapsOf([block('a', 2, 3), block('b', 3, 3, { cols: 2, rows: 2 })], GRID);

    expect(caps).toHaveLength(1);
    const [cap] = caps;
    expect([cap.left, cap.top, cap.width, cap.height]).toEqual([99, 149, 152, 102]);
    expect([cap.cols, cap.rows]).toEqual([3, 2]);
    expect(cap.cells).toEqual([
      { identifier: 'a', index: 0, cols: 1 },
      { identifier: 'b', index: 0, cols: 2 },
      { identifier: 'b', index: 1, cols: 2 },
      null,
      { identifier: 'b', index: 2, cols: 2 },
      { identifier: 'b', index: 3, cols: 2 },
    ]);
    // Cut to the cells without reaching past them, since nothing else stands against the cap.
    expect(cap.path).toBe('M1 1H151V51H1ZM51 51H151V101H51Z');
  });

  it('keeps tops of different heights apart, and lets neither reach over the other', () => {
    const caps = squareCapsOf([block('low', 0, 0, { topPx: 50 }), block('high', 1, 0)], GRID);

    expect(caps.map((cap) => cap.path)).toEqual(['M1 1H51V51H1Z', 'M1 1H51V51H1Z']);
  });

  it('keeps tops of different pictures apart, each reaching a pixel over the join', () => {
    const caps = squareCapsOf([block('stone', 0, 0), block('wood', 1, 0, { look: 'wood' })], GRID);

    expect(caps.map((cap) => cap.path)).toEqual(['M1 1H52V51H1Z', 'M0 1H51V51H0Z']);
  });

  it('parts the tops at the edge of a chunk, and reaches a pixel over it both ways', () => {
    const caps = squareCapsOf([block('west', 7, 0), block('east', 8, 0)], GRID);

    expect(caps.map((cap) => cap.key)).toEqual(['0,0:7,0', '1,0:8,0']);
    expect(caps.map((cap) => cap.path)).toEqual(['M1 1H52V51H1Z', 'M0 1H51V51H0Z']);
  });

  it('cuts round the ground a ring of walls encloses', () => {
    const ring = [0, 1, 2].flatMap((row) =>
      [0, 1, 2].filter((col) => row !== 1 || col !== 1).map((col) => block(`${col}${row}`, col, row))
    );
    const [cap, ...rest] = squareCapsOf(ring, GRID);

    expect(rest).toHaveLength(0);
    expect(cap.cells[4]).toBeNull();
    expect(cap.path).toBe('M1 1H151V51H1ZM1 51H51V101H1ZM101 51H151V101H101ZM1 101H151V151H1Z');
    expect(capCellAt(cap, 76, 76, GRID)).toBeNull();
    expect(capCellAt(cap, 126, 76, GRID)).toEqual({ identifier: '21', index: 0, cols: 1 });
  });

  it('reaches over a join above or below only along the part of a row that has one', () => {
    const caps = squareCapsOf([block('a', 0, 0), block('b', 1, 0), block('under', 1, 1, { look: 'wood' })], GRID);

    expect(caps[0].path).toBe('M1 1H51V51H1ZM51 1H101V52H51Z');
  });

  it('answers nothing past the edge of a cap', () => {
    const [cap] = squareCapsOf([block('a', 0, 0)], GRID);

    expect(capCellAt(cap, -5, 10, GRID)).toBeNull();
    expect(capCellAt(cap, 60, 10, GRID)).toBeNull();
  });
});
