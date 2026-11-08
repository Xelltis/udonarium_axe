import { GameTable } from '@axe/domain/tabletop/game-table';
import { isTableWall, tableWallSettings } from '@axe/domain/tabletop/table-walls';

describe('table walls', () => {
  it('tells the walls of the table from the floor and from a board', () => {
    for (const wall of ['north-wall', 'east-wall', 'south-wall', 'west-wall']) expect(isTableWall(wall)).toBe(true);
    expect(isTableWall('floor')).toBe(false);
    expect(isTableWall('a-board')).toBe(false);
    expect(isTableWall(undefined)).toBe(false);
  });

  it('runs the north and south walls along the width of the table and the others along its depth', () => {
    const table = new GameTable();
    table.width = 20;
    table.height = 15;
    table.gridSize = 50;
    table.wallHeight = 6;
    table.showEastWall = true;
    table.eastWallImageIdentifier = 'east-picture';

    const walls = tableWallSettings(table);

    expect(walls.map((wall) => [wall.surface, wall.lengthPx, wall.heightPx])).toEqual([
      ['north-wall', 1000, 300],
      ['east-wall', 750, 300],
      ['south-wall', 1000, 300],
      ['west-wall', 750, 300],
    ]);
    expect(walls.find((wall) => wall.shown)).toMatchObject({ surface: 'east-wall', imageIdentifier: 'east-picture' });
  });
});
