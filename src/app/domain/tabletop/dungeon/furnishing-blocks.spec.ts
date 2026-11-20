import { furnishingBlocks } from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import type { DungeonFurnishing } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { blockCorner, blockOrigin, cellCentre } from '@axe/domain/tabletop/map-grid';

const HEXES = [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL];

/** Where the middle of the block stands, on a board of cells a unit across. */
function middleOf(block: ReturnType<typeof furnishingBlocks>[number], gridType: GridType) {
  const corner = blockCorner(block, { type: gridType, sizePx: 1 });
  return { x: corner.x + block.rect.w / 2, y: corner.y + block.rect.h / 2 };
}

describe('a piece of furniture of several cells drawn as its model', () => {
  const pieces: DungeonFurnishing[] = [
    { piece: 'magicCircle', x: 4, y: 3, w: 3, h: 3, spin: 0 },
    { piece: 'bed', x: 5, y: 2, w: 1, h: 2, spin: 0, facing: 0 },
    { piece: 'rouletteTable', x: 3, y: 5, w: 2, h: 1, spin: 0 },
  ];

  it('stands its middle on the middle of one of the hexes it took, as a block of several hexes is drawn round one', () => {
    for (const gridType of HEXES) {
      for (const piece of pieces) {
        const [block] = furnishingBlocks(piece, 1, { models: true });
        const middle = middleOf(block, gridType);
        const onACell = Array.from({ length: piece.w * piece.h }, (_, at) =>
          cellCentre(
            { x: piece.x + (at % piece.w), y: piece.y + Math.floor(at / piece.w) },
            { type: gridType, sizePx: 1 }
          )
        ).some((centre) => Math.hypot(centre.x - middle.x, centre.y - middle.y) < 1e-9);
        expect(onACell, `${gridType} ${piece.piece}`).toBe(true);
      }
    }
  });

  it('stands a piece on the cell the furnisher names, and one it names none for on the cell nearest its middle', () => {
    for (const gridType of HEXES) {
      const named: DungeonFurnishing = {
        piece: 'bed',
        x: 5,
        y: 2,
        w: 1,
        h: 2,
        spin: 0,
        facing: 0,
        standsOn: { x: 5, y: 3 },
      };
      const circle: DungeonFurnishing = { piece: 'magicCircle', x: 4, y: 3, w: 3, h: 3, spin: 0, facing: 0 };
      for (const [piece, cell] of [
        [named, { x: 5, y: 3 }],
        [circle, { x: 5, y: 4 }],
      ] as const) {
        const [block] = furnishingBlocks(piece, 1, { models: true });
        const middle = middleOf(block, gridType);
        const centre = cellCentre(cell, { type: gridType, sizePx: 1 });
        expect(Math.hypot(centre.x - middle.x, centre.y - middle.y), `${gridType} ${piece.piece}`).toBeLessThan(1e-9);
      }
    }
  });

  it('stands as its rectangle on squares', () => {
    for (const piece of pieces) {
      const [block] = furnishingBlocks(piece, 12, { models: true });
      const grid = { type: GridType.SQUARE, sizePx: 1 };
      expect(blockCorner(block, grid)).toEqual(blockOrigin(block.rect, grid));
    }
  });
});
