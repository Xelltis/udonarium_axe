import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { EMPTY_TABLE_WORLD, tableWorldOf } from '@axe/domain/tabletop/world/table-world';

describe('the table world', () => {
  it('lays the board out as wide and deep as its cells run', () => {
    const table = new GameTable();
    table.width = 20;
    table.height = 15;
    table.gridSize = 60;
    table.gridType = GridType.HEX_VERTICAL;

    expect(tableWorldOf(table).board).toEqual({
      widthPx: 1200,
      depthPx: 900,
      gridSize: 60,
      gridType: GridType.HEX_VERTICAL,
    });
  });

  it('draws nothing for no table', () => {
    expect(tableWorldOf(null)).toBe(EMPTY_TABLE_WORLD);
    expect(EMPTY_TABLE_WORLD.board).toBeNull();
  });
});
