import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { boardShapeOf, EMPTY_TABLE_WORLD, tableWorldOf } from '@axe/domain/tabletop/world/table-world';

describe('the table world', () => {
  function table(gridType = GridType.SQUARE): GameTable {
    const made = new GameTable();
    made.width = 20;
    made.height = 15;
    made.gridSize = 60;
    made.gridType = gridType;
    made.imageIdentifier = 'board-picture';
    return made;
  }

  it('lays the board out as wide and deep as its cells run, with its picture and a veil over it', () => {
    const board = tableWorldOf(table(GridType.HEX_VERTICAL), (identifier) => `blob:${identifier}`).board!;

    expect(board).toMatchObject({
      widthPx: 1200,
      depthPx: 900,
      gridSize: 60,
      gridType: GridType.HEX_VERTICAL,
      pictureUrl: 'blob:board-picture',
      veiled: true,
    });
  });

  it('gives a board no picture where its picture cannot be read', () => {
    expect(tableWorldOf(table()).board!.pictureUrl).toBe('');
  });

  it('draws nothing for no table', () => {
    expect(tableWorldOf(null)).toBe(EMPTY_TABLE_WORLD);
    expect(EMPTY_TABLE_WORLD.board).toBeNull();
  });

  it('stretches the picture of a square board over the whole board', () => {
    expect(boardShapeOf(20, 15, 50, GridType.SQUARE)).toEqual({
      box: { x: 0, y: 0, width: 1000, height: 750 },
      hexes: null,
    });
  });

  it('stretches the picture of a hex board past its cells, and cuts it to them', () => {
    const geo = computeHexMaskGeometry(4, 3, 50, GridType.HEX_HORIZONTAL)!;
    const shape = boardShapeOf(4, 3, 50, GridType.HEX_HORIZONTAL);

    expect(shape.box).toEqual({ x: -geo.offsetX, y: -geo.offsetY, width: geo.pixelW, height: geo.pixelH });
    expect(shape.hexes).toHaveLength(12);
    expect(shape.hexes![0]).toHaveLength(6);
    const xs = shape.hexes!.flat().map((corner) => corner.x);
    expect(Math.min(...xs)).toBeCloseTo(shape.box.x - 1, 0);
  });
});
